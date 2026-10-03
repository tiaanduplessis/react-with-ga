'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const React = require('react')
const hoist = require('hoist-non-react-statics')
const pkg = require('../package.json')

function load(file, format, analytics) {
  const dependencies = {
    react: React,
    'react-ga': analytics,
    'hoist-non-react-statics': hoist,
  }
  const sandbox = {
    window: { location: { pathname: '/synthetic', search: '?test=1' } },
  }
  if (format === 'global') {
    Object.assign(sandbox, { react: React, ReactGA: analytics, hoistNonReactStatic: hoist })
  } else if (format === 'amd') {
    sandbox.define = (names, factory) => {
      sandbox.result = factory(...names.map(name => dependencies[name]))
    }
    sandbox.define.amd = true
  } else {
    sandbox.module = { exports: {} }
    sandbox.exports = sandbox.module.exports
    sandbox.require = name => {
      assert(Object.prototype.hasOwnProperty.call(dependencies, name), `Unexpected import: ${name}`)
      return dependencies[name]
    }
  }
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file })
  const exported = format === 'global' ? sandbox.reactWithGa
    : format === 'amd' ? sandbox.result : sandbox.module.exports
  return { withGA: exported.default || exported, location: sandbox.window.location }
}

function check(file, format) {
  const calls = { initialize: [], pageview: [] }
  const analytics = {
    initialize: (...args) => calls.initialize.push(JSON.parse(JSON.stringify(args))),
    pageview: (...args) => calls.pageview.push(args),
  }
  const { withGA, location } = load(file, format, analytics)
  withGA.setConfig({ trackingID: 'synthetic-config', debug: false })
  withGA.setConfig({ titleCase: false })

  function Plain() { return null }
  class Parent extends React.Component { render() { return null } }
  Parent.inheritedStatic = 'inherited'
  class Child extends Parent {}
  const Forward = React.forwardRef((props, ref) => React.createElement('span', { ref }, props.children))
  const Memo = React.memo(Plain, (previous, next) => previous.value === next.value)
  const symbol = Symbol('custom static')

  ;[Plain, Child, Forward, Memo].forEach((Component, index) => {
    Component.displayName = `Subject${index}`
    Component.defaultProps = { value: 'default' }
    Component.propTypes = { value: () => null }
    Component.customStatic = { index }
    Component[symbol] = `symbol${index}`
    let reads = 0
    Object.defineProperty(Component, 'hiddenStatic', {
      configurable: true,
      enumerable: false,
      get() { reads += 1; return index },
    })

    const Wrapped = withGA(Component, { trackingID: 'synthetic-override', debug: true })
    assert.strictEqual(typeof Wrapped, 'function')
    assert.strictEqual(Wrapped.displayName, `withGA(Subject${index})`)
    assert.strictEqual(Wrapped.customStatic, Component.customStatic)
    assert.strictEqual(Wrapped[symbol], Component[symbol])
    assert.strictEqual(reads, 0, 'Hoisting must not invoke custom getters')
    assert.deepStrictEqual(Object.getOwnPropertyDescriptor(Wrapped, 'hiddenStatic'),
      Object.getOwnPropertyDescriptor(Component, 'hiddenStatic'))
    assert.strictEqual(Wrapped.hiddenStatic, index)
    assert.strictEqual(reads, 1)
    ;['$$typeof', 'compare', 'type', 'render', 'defaultProps', 'propTypes'].forEach(key => {
      assert.strictEqual(Object.prototype.hasOwnProperty.call(Wrapped, key), false,
        `${Component.displayName}: React static ${key} must not be hoisted`)
    })
    if (Component === Child) assert.strictEqual(Wrapped.inheritedStatic, 'inherited')

    const ref = React.createRef()
    const marker = { index }
    const element = new Wrapped({ forwardedRef: ref, value: 'passed', marker, children: 'child' }).render()
    assert(React.isValidElement(element))
    assert.strictEqual(element.type, Component)
    assert.strictEqual(element.ref, ref)
    assert.strictEqual(element.props.ga, analytics)
    assert.strictEqual(element.props.value, 'passed')
    assert.strictEqual(element.props.marker, marker)
    assert.strictEqual(element.props.children, 'child')
    assert.strictEqual(Object.prototype.hasOwnProperty.call(element.props, 'forwardedRef'), false)
  })

  assert.deepStrictEqual(calls.initialize, [[
    'synthetic-override',
    { trackingID: 'synthetic-config', debug: true, titleCase: false },
  ]])
  assert.deepStrictEqual(calls.pageview, Array.from({ length: 4 }, () => ['/synthetic?test=1']))
  location.pathname = '/next'
  location.search = ''
  function Named() { return null }
  assert.strictEqual(withGA(Named).displayName, 'withGA(Named)')
  assert.strictEqual(withGA(React.memo(Named)).displayName, 'withGA(Component)')
  assert.strictEqual(calls.initialize.length, 1)
  assert.deepStrictEqual(calls.pageview.slice(4), [['/next'], ['/next']])

  const fallbackCalls = []
  const fallback = load(file, format, {
    initialize: (...args) => fallbackCalls.push(JSON.parse(JSON.stringify(args))),
    pageview() {},
  }).withGA
  fallback.setConfig({ trackingID: 'synthetic-fallback', testMode: true })
  fallback(Named)
  assert.deepStrictEqual(fallbackCalls, [[
    'synthetic-fallback', { trackingID: 'synthetic-fallback', testMode: true },
  ]])
  console.log(`PASS ${format}: ${path.basename(file)} (React ${React.version})`)
}

if (require.main === module) {
  check(path.resolve(__dirname, '..', pkg.main), 'commonjs')
  ;['commonjs', 'global', 'amd'].forEach(format => {
    check(path.resolve(__dirname, '..', pkg['umd:main']), format)
  })
}

module.exports = check
