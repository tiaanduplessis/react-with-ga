import React from 'react' // eslint-disable-line

import ReactGA from 'react-ga'
import hoistNonReactStatic from 'hoist-non-react-statics'

let initialized = false
let config = {}

// https://reactjs.org/docs/higher-order-components.html#convention-wrap-the-display-name-for-easy-debugging
function getDisplayName(WrappedComponent) {
  return WrappedComponent.displayName || WrappedComponent.name || 'Component'
}

function withGA(WrappedComponent, { trackingID = '', ...otherOpts } = {}) {
  if (!initialized) {
    ReactGA.initialize(
      trackingID || config.trackingID,
      Object.assign({}, config, otherOpts),
    )
    initialized = true
  }

  ReactGA.pageview(window.location.pathname + window.location.search)

  class WithGoogleAnalytics extends React.Component {
    render() {
      const { forwardedRef, ...rest } = this.props
      return <WrappedComponent ref={forwardedRef} ga={ReactGA} {...rest} />
    }
  }

  WithGoogleAnalytics.displayName = `withGA(${getDisplayName(
    WrappedComponent,
  )})`

  hoistNonReactStatic(WithGoogleAnalytics, WrappedComponent)

  return WithGoogleAnalytics
}

withGA.setConfig = (newConfig = {}) => {
  config = Object.assign({}, config, newConfig)
  return config
}

export default withGA
