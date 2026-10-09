'use strict'

// Run only against a separately audited dependency tree. No package install, real
// browser, analytics transport, or native dependency require is used by this test.
// Example: node --experimental-vm-modules test/analytics.test.js \
//   --dependency-root /path/to/audited-runtime [--root /path/to/packed/package]
// An optional --source path accepts an already compiled, audited source ESM file.
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

function optionsFrom(args) {
  const options = { root: path.resolve(__dirname, '..') }
  const names = { '--root': 'root', '--dependency-root': 'dependencyRoot', '--source': 'source' }
  for (let index = 0; index < args.length; index += 2) {
    assert(names[args[index]] && args[index + 1], `Unknown or incomplete option: ${args[index]}`)
    options[names[args[index]]] = path.resolve(args[index + 1])
  }
  options.dependencyRoot = options.dependencyRoot || options.root
  return options
}

function json(file) { return JSON.parse(fs.readFileSync(file, 'utf8')) }
function plain(value) { return JSON.parse(JSON.stringify(value)) }
function equal(actual, expected, message) { assert.deepStrictEqual(plain(actual), expected, message) }
function inside(root, file) { return file === root || file.startsWith(`${root}${path.sep}`) }

function environment(dependencyRoot, useScriptFixture) {
  const browserCalls = []
  const documentCalls = []
  const blockedCalls = []
  const messages = []
  const block = name => function blocked() {
    blockedCalls.push(name)
    throw new Error(`Forbidden test capability: ${name}`)
  }
  const location = { pathname: '/fixture', search: '?view=one' }
  const ga = (...args) => { browserCalls.push(args) }
  const window = { location, ga }
  const sandbox = {
    window,
    process: Object.freeze({ env: Object.freeze({ NODE_ENV: 'development' }) }),
    console: Object.freeze({
      log: (...args) => messages.push(args),
      warn: (...args) => messages.push(args),
      error: (...args) => messages.push(args),
    }),
  }
  // These are throwing fixtures, never Node or browser implementations. Exposing
  // them explicitly also makes an accidental attempt fail the scenario.
  ;['fetch', 'XMLHttpRequest', 'Image', 'WebSocket', 'EventSource', 'Worker',
    'setTimeout', 'setInterval', 'setImmediate', 'requestAnimationFrame',
    'clearTimeout', 'clearInterval', 'clearImmediate', 'queueMicrotask', 'open']
    .forEach(name => { sandbox[name] = window[name] = block(name) })
  sandbox.navigator = window.navigator = Object.freeze({ sendBeacon: block('sendBeacon') })

  const scripts = new Set()
  const existingScript = { parentNode: { insertBefore(script, before) {
    assert(useScriptFixture && scripts.has(script), 'Only owned inert script fixtures may be inserted')
    assert.strictEqual(before, existingScript)
    documentCalls.push(['insertBefore', script.src, script.async])
  } } }
  const document = {
    createElement(name) {
      if (!useScriptFixture) return block('document.createElement')()
      assert.strictEqual(name, 'script')
      // A plain object with no DOM connection: assigning src cannot load a URL.
      const script = Object.create(null)
      scripts.add(script)
      documentCalls.push(['createElement', name])
      return script
    },
    getElementsByTagName(name) {
      if (!useScriptFixture) return block('document.getElementsByTagName')()
      assert.strictEqual(name, 'script')
      documentCalls.push(['getElementsByTagName', name])
      return [existingScript]
    },
    write: block('document.write'),
    appendChild: block('document.appendChild'),
    body: Object.freeze({ appendChild: block('document.body.appendChild') }),
    head: Object.freeze({ appendChild: block('document.head.appendChild') }),
  }
  sandbox.document = window.document = document
  sandbox.self = window
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } })
  const nodeModules = fs.realpathSync(path.join(dependencyRoot, 'node_modules'))
  const packageNames = ['react', 'react-ga', 'prop-types', 'hoist-non-react-statics', 'react-is', 'object-assign']
  const packages = new Map(packageNames.map(name => {
    const root = fs.realpathSync(path.join(nodeModules, name))
    assert(inside(nodeModules, root), `Dependency must stay inside the audited tree: ${name}`)
    return [name, { root, manifest: json(path.join(root, 'package.json')) }]
  }))
  const cache = new Map()

  function resolveFile(candidate, root) {
    const file = [candidate, `${candidate}.js`, path.join(candidate, 'index.js')]
      .find(item => fs.existsSync(item) && fs.statSync(item).isFile())
    assert(file, `Missing audited module: ${candidate}`)
    const resolved = fs.realpathSync(file)
    assert(inside(root, resolved), `Import escapes the audited package: ${candidate}`)
    assert.strictEqual(path.extname(resolved), '.js', 'Only JavaScript dependency modules are allowed')
    return resolved
  }

  function dependencyRequire(request, parentFile, parentRoot) {
    assert.strictEqual(typeof request, 'string')
    let file
    let root
    if (request.startsWith('./') || request.startsWith('../')) {
      assert(parentFile && parentRoot, `Relative import has no package: ${request}`)
      root = parentRoot
      file = resolveFile(path.resolve(path.dirname(parentFile), request), root)
    } else {
      const name = request.split('/')[0]
      assert(packages.has(name), `Unexpected dependency import: ${request}`)
      const entry = packages.get(name)
      root = entry.root
      const suffix = request.slice(name.length + 1)
      file = resolveFile(path.join(root, suffix || entry.manifest.main || 'index.js'), root)
    }
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    const evaluate = vm.runInContext(`(function (module, exports, require) {\n${fs.readFileSync(file, 'utf8')}\n})`, context, {
      filename: file, timeout: 1000,
    })
    evaluate(module, module.exports, name => {
      // ReactGA's actual UMD/main may only consume its audited peer modules.
      if (root === packages.get('react-ga').root) {
        assert(['react', 'prop-types'].includes(name), `Unexpected ReactGA peer import: ${name}`)
      }
      return dependencyRequire(name, file, root)
    })
    return module.exports
  }

  // Window/document exist before ReactGA captures its browser detection flag.
  const React = dependencyRequire('react')
  const ReactGA = dependencyRequire('react-ga')
  const dependencies = {
    react: React,
    'react-ga': ReactGA,
    'hoist-non-react-statics': dependencyRequire('hoist-non-react-statics'),
  }
  function wrapperRequire(name) {
    assert(Object.prototype.hasOwnProperty.call(dependencies, name), `Unexpected wrapper import: ${name}`)
    return dependencies[name]
  }
  return {
    context, sandbox, React, ReactGA, wrapperRequire, location, ga,
    browserCalls, documentCalls, blockedCalls, messages,
  }
}

async function load(target, options, useScriptFixture) {
  const env = environment(options.dependencyRoot, useScriptFixture)
  const { context, sandbox, wrapperRequire } = env
  let exported
  if (target.format === 'esm') {
    assert.strictEqual(typeof vm.SourceTextModule, 'function', 'Run Node with --experimental-vm-modules to test native ESM')
    const module = new vm.SourceTextModule(fs.readFileSync(target.file, 'utf8'), {
      context, identifier: target.file,
    })
    await module.link(name => new vm.SyntheticModule(['default'], function exportDependency() {
      // Native ESM importing CommonJS receives module.exports as its default.
      this.setExport('default', wrapperRequire(name))
    }, { context, identifier: `audited:${name}` }))
    await module.evaluate({ timeout: 1000 })
    exported = module.namespace.default
  } else {
    if (target.format === 'global') {
      Object.assign(sandbox, {
        react: env.React, ReactGA: env.ReactGA,
        hoistNonReactStatic: wrapperRequire('hoist-non-react-statics'),
      })
    } else if (target.format === 'amd') {
      sandbox.define = (names, factory) => { sandbox.result = factory(...names.map(wrapperRequire)) }
      sandbox.define.amd = true
    } else {
      sandbox.module = { exports: {} }
      sandbox.exports = sandbox.module.exports
      sandbox.require = wrapperRequire
    }
    vm.runInContext(fs.readFileSync(target.file, 'utf8'), context, { filename: target.file, timeout: 1000 })
    exported = target.format === 'global' ? sandbox.reactWithGa
      : target.format === 'amd' ? sandbox.result : sandbox.module.exports
  }
  env.withGA = exported.default || exported
  env.analytics = target.format === 'esm' ? env.ReactGA : env.ReactGA.default || env.ReactGA
  assert.strictEqual(typeof env.withGA, 'function')
  return env
}

function Subject() { return null }
function page(pagePath) { return ['send', { hitType: 'pageview', page: pagePath }] }
function configured(env, extra) {
  env.withGA.setConfig(Object.assign({ trackingID: 'fixture-config', testMode: true, titleCase: false }, extra))
  return env.withGA(Subject)
}
function instrument(object, name) {
  const calls = []
  const original = object[name]
  object[name] = function record(...args) {
    calls.push(plain(args))
    return original.apply(this, args)
  }
  return calls
}

const scenarios = [
  {
    name: 'shared: default initialization and pageview', scriptFixture: true,
    run(env) {
      env.withGA(Subject, { trackingID: 'fixture-default' })
      equal(env.browserCalls, [['create', 'fixture-default', 'auto'], page('/fixture?view=one')])
      equal(env.documentCalls, [
        ['createElement', 'script'], ['getElementsByTagName', 'script'],
        ['insertBefore', 'https://www.google-analytics.com/analytics.js', 1],
      ])
      equal(env.analytics.testModeAPI.calls, [])
    },
  },
  {
    name: 'shared: config precedence, initialize once, pageviews and ga identity',
    run(env) {
      const initialize = instrument(env.analytics, 'initialize')
      const pageviews = instrument(env.analytics, 'pageview')
      env.withGA.setConfig({ trackingID: 'fixture-config', testMode: true, titleCase: true, gaOptions: { name: 'configured' } })
      env.withGA.setConfig({ debug: false })
      const Wrapped = env.withGA(Subject, {
        trackingID: 'fixture-override', titleCase: false, gaOptions: { name: 'overridden' },
      })
      const ref = env.React.createRef()
      const marker = {}
      const element = new Wrapped({ forwardedRef: ref, marker }).render()
      assert(env.React.isValidElement(element))
      assert.strictEqual(element.type, Subject)
      assert.strictEqual(element.ref, ref)
      assert.strictEqual(element.props.marker, marker)
      assert.strictEqual(element.props.ga, env.analytics)
      assert.strictEqual(Object.prototype.hasOwnProperty.call(element.props, 'forwardedRef'), false)
      env.location.pathname = '/next'
      env.location.search = '?view=two'
      env.withGA(Subject, { trackingID: 'fixture-ignored', titleCase: true })
      equal(initialize, [['fixture-override', {
        trackingID: 'fixture-config', testMode: true, titleCase: false,
        gaOptions: { name: 'overridden' }, debug: false,
      }]])
      equal(pageviews, [['/fixture?view=one'], ['/next?view=two']])
      env.analytics.event({ category: 'sample category', action: 'sample action', label: 'sample label' })
      equal(env.analytics.testModeAPI.calls, [
        ['create', 'fixture-override', { name: 'overridden' }],
        page('/fixture?view=one'), page('/next?view=two'),
        ['send', { hitType: 'event', eventCategory: 'sample category', eventAction: 'sample action', eventLabel: 'sample label' }],
      ])
      equal(env.browserCalls, [])
    },
  },
  {
    name: 'shared: configured tracking ID fallback',
    run(env) {
      configured(env)
      equal(env.analytics.testModeAPI.calls, [['create', 'fixture-config', 'auto'], page('/fixture?view=one')])
      equal(env.browserCalls, [])
    },
  },
  {
    name: 'shared: unnamed plugin.require routing',
    run(env) {
      configured(env)
      env.analytics.plugin.require('fixturePlugin', { sample: true })
      env.analytics.plugin.require('fixturePlugin')
      equal(env.analytics.testModeAPI.calls.slice(2), [
        ['require', 'fixturePlugin', { sample: true }], ['require', 'fixturePlugin'],
      ])
    },
  },
  {
    name: 'shared: ordinary labels and complete email redaction',
    run(env) {
      configured(env)
      ;['ordinary label', 'sample@example.invalid'].forEach(label => {
        env.analytics.event({ category: 'sample category', action: 'sample action', label })
      })
      equal(env.analytics.testModeAPI.calls.slice(2).map(call => call[1].eventLabel), [
        'ordinary label', 'REDACTED (Potential Email Address)',
      ])
    },
  },
  {
    name: '2.7 feature: named tracker plugin.require routing',
    run(env) {
      configured(env)
      env.analytics.plugin.require('fixturePlugin', { sample: true }, 'fixtureTracker')
      env.analytics.plugin.require('fixturePlugin', undefined, 'fixtureTracker')
      equal(env.analytics.testModeAPI.calls.slice(2), [
        ['fixtureTracker.require', 'fixturePlugin', { sample: true }],
        ['fixtureTracker.require', 'fixturePlugin'],
      ])
    },
  },
  {
    name: '2.7 feature: resetCalls preserves array identity',
    run(env) {
      configured(env)
      const calls = env.analytics.testModeAPI.calls
      assert.strictEqual(typeof env.analytics.testModeAPI.resetCalls, 'function')
      assert.strictEqual(calls.length, 2)
      env.analytics.testModeAPI.resetCalls()
      assert.strictEqual(env.analytics.testModeAPI.calls, calls)
      assert.strictEqual(calls.length, 0)
      env.analytics.pageview('/after-reset')
      equal(calls, [page('/after-reset')])
      env.analytics.testModeAPI.resetCalls()
      assert.strictEqual(env.analytics.testModeAPI.calls, calls)
      equal(calls, [])
    },
  },
  ...[false, true].map(testMode => ({
    name: `2.7 feature: useExistingGa with standardImplementation (testMode=${testMode})`,
    run(env) {
      configured(env, { testMode, useExistingGa: true, standardImplementation: true })
      assert.strictEqual(env.sandbox.window.ga, env.ga)
      equal(testMode ? env.analytics.testModeAPI.calls : env.browserCalls, [page('/fixture?view=one')])
      equal(testMode ? env.browserCalls : env.analytics.testModeAPI.calls, [])
      equal(env.documentCalls, [])
    },
  })),
  {
    // Deliberate 2.7 behavior change: any string containing @ is redacted,
    // including bounded, non-address labels that 2.5.6 used to retain.
    name: '2.7 change: lone, leading and trailing @ redaction',
    run(env) {
      configured(env)
      ;['@', 'sample@', '@sample', 'sample@@'].forEach(label => {
        env.analytics.event({ category: 'sample category', action: 'sample action', label })
      })
      equal(env.analytics.testModeAPI.calls.slice(2).map(call => call[1].eventLabel),
        Array(4).fill('REDACTED (Potential Email Address)'))
    },
  },
]

async function main() {
  const options = optionsFrom(process.argv.slice(2))
  const pkg = json(path.join(options.root, 'package.json'))
  const targets = [
    { name: 'commonjs', file: path.resolve(options.root, pkg.main), format: 'commonjs' },
    ...['commonjs', 'amd', 'global'].map(format => ({
      name: `umd-${format}`, file: path.resolve(options.root, pkg['umd:main']), format,
    })),
    { name: 'native-esm', file: path.resolve(options.root, pkg.module), format: 'esm' },
  ]
  if (options.source) targets.push({ name: 'compiled-source-esm', file: options.source, format: 'esm' })
  const versions = ['react', 'react-ga'].map(name => {
    const manifest = json(path.join(options.dependencyRoot, 'node_modules', name, 'package.json'))
    return `${name} ${manifest.version}`
  }).join(', ')
  let passed = 0
  let failed = 0
  for (const target of targets) {
    for (const scenario of scenarios) {
      let env
      try {
        env = await load(target, options, scenario.scriptFixture === true)
        scenario.run(env)
        equal(env.blockedCalls, [], 'A forbidden capability was attempted')
        if (!scenario.scriptFixture) equal(env.documentCalls, [], 'Document must remain untouched')
        passed += 1
        console.log(`PASS ${target.name}: ${scenario.name}`)
      } catch (error) {
        failed += 1
        console.error(`FAIL ${target.name}: ${scenario.name}\n${error.stack}`)
      }
    }
  }
  console.log(`Analytics contracts: ${passed} passed, ${failed} failed (${versions})`)
  if (failed) process.exitCode = 1
}

main().catch(error => { console.error(error.stack); process.exitCode = 1 })
