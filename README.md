
# react-with-ga
[![package version](https://img.shields.io/npm/v/react-with-ga.svg?style=flat-square)](https://npmjs.org/package/react-with-ga)
[![package downloads](https://img.shields.io/npm/dm/react-with-ga.svg?style=flat-square)](https://npmjs.org/package/react-with-ga)
[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)
[![package license](https://img.shields.io/npm/l/react-with-ga.svg?style=flat-square)](https://npmjs.org/package/react-with-ga)
[![make a pull request](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)

> HOC for adding google analytics to component

## Table of Contents

- [react-with-ga](#react-with-ga)
    - [Table of Contents](#table-of-contents)
    - [Install](#install)
    - [Usage](#usage)
    - [Contribute](#contribute)
    - [License](#license)

## Install

This project uses [node](https://nodejs.org) and [npm](https://www.npmjs.com). 

```sh
$ npm install react-with-ga
$ # OR
$ yarn add react-with-ga
```

## Usage

```js
import React, { Component } from "react";
import ReactDOM from "react-dom";

import withGA from "react-with-ga";

import "./styles.css";

withGA.setConfig({
  trackingID: "UA-000000-01"
});

class Temp extends Component {
  componentDidMount() {
    // https://www.npmjs.com/package/react-ga
    console.log(this.props.ga); // Object {initialize: function initialize(), ga: function ga(), set: function set(), send: function send(), pageview: function pageview()…}
  }
  render() {
    return (
      <div className="App">
        <h1>Hello CodeSandbox</h1>
        <h2>Start editing to see some magic happen!</h2>
      </div>
    );
  }
}

const rootElement = document.getElementById("root");

const App = withGA(Temp);
ReactDOM.render(<App />, rootElement);
```

The minimum `react-ga` version is 2.7.0. Its API is available through the injected
`ga` prop, including named-tracker plugin requirements and `testModeAPI.resetCalls`.
Initialization options passed through `withGA` or `withGA.setConfig` can use
`standardImplementation: true` together with `useExistingGa: true` to reuse an
already configured `window.ga` without loading another analytics script or
creating another tracker.

ReactGA 2.7.0 redacts every string label containing `@`, including a lone or
trailing `@`. This is broader than the previous locked version's email-pattern
matching.

## Contribute

1. Fork it and create your feature branch: `git checkout -b my-new-feature`
2. Commit your changes: `git commit -am "Add some feature"`
3. Push to the branch: `git push origin my-new-feature`
4. Submit a pull request

`npm test` retains the component/static-hoisting checks. `npm run test:analytics`
checks the actual ReactGA API using synthetic locations, inert browser providers
and owned call recorders; it cannot load analytics scripts or send network traffic.
The focused analytics suite requires Node 16 or newer and accepts
`-- --dependency-root /path/to/isolated-install --root /path/to/package` for an
isolated runtime or an extracted npm package. These checks do not run the legacy
lint or build toolchain.

## License

MIT
    