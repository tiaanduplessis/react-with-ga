
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

## Contribute

1. Fork it and create your feature branch: `git checkout -b my-new-feature`
2. Commit your changes: `git commit -am "Add some feature"`
3. Push to the branch: `git push origin my-new-feature`
4. Submit a pull request

## License

MIT
    