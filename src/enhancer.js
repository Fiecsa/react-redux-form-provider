import objectPath from 'object-path'

import { VALUE } from './constants'
import * as actions from './actions'

export default function formEnhancer(formReducerName) {
  let validators = []
  let submitListeners = []
  
  function addValidator(path, validator) {
    validators.push({ path, validator })

    return () => removeValidator(path, validator)
  }

  function removeValidator(path, validator) {
    validators = validators.filter((v) => {
      return v.path !== path && v.validator !== validator
    })
  }

  function addSubmitListener(listener, submitOnValue) {
    submitListeners.push({ listener, submitOnValue })

    return () => removeSubmitListener(listener)
  }

  function removeSubmitListener(listener) {
    submitListeners = submitListeners.filter((x) => x.listener !== listener)
  }

  function getFormState(store) {
    let state = store.getState()

    if (formReducerName) state = state[formReducerName]

    return state
  }

  return (next) => (...args) => {
    const store = next(...args)
    const initialState = getFormState(store)
    let triggerOnValueListeners = false

    // triggers submitOnValue listeners on state change, allows for async
    // store updates like batched subscribe
    const unsubscribe = store.subscribe(() => {
      if (triggerOnValueListeners) {
        triggerOnValueListeners = false

        const onValueSubmitListeners = submitListeners
          .filter(({ submitOnValue }) => submitOnValue)
          .map(({ listener }) => listener)

        submitWithListeners(onValueSubmitListeners)
      }
    })

    function submitWithListeners(listeners) {
      if (listeners.length === 0) return Promise.resolve()

      return validate().then((isValid) => {
        if (!isValid) return

        const state = getFormState(store)
        listeners.forEach((listener) => listener(state))
      })
    }

    function dispatch(action) {
      if (action.type === VALUE) {
        triggerOnValueListeners = true
      }

      store.dispatch(action)
    }

    function runValidator({ path, validator }) {
      const value = objectPath.get(getFormState(store), path)

      let result = validator(value)

      // convert result to promise
      if (typeof result !== 'object' || !result.then) {
        if (result === true) {
          result = Promise.resolve()
        } else {
          result = Promise.reject(result)
        }
      }

      return result
        .then(() => {
          dispatch(actions.clearValidationError(path))
          return true
        })
        .catch((err) => {
          dispatch(actions.setValidationError(path, err))
          return false
        })
    }

    function validate() {
      return Promise.all(validators.map(runValidator))
        .then((results) => results.every((isValid) => isValid))
    }

    function submit() {
      const allSubmitListeners = submitListeners
        .map(({ listener }) => listener)

      return submitWithListeners(allSubmitListeners)
    }

    function reset() {
      dispatch(actions.setState(initialState))
    }

    function clear() {
      dispatch(actions.setState({}))
    }

    return {
      ...store,
      dispatch,
      formReducerName,
      addValidator,
      removeValidator,
      validate,
      addSubmitListener,
      removeSubmitListener,
      submit,
      reset,
      clear,
      unsubscribe
    }
  }
}