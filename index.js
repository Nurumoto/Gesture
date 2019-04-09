import React from 'react'

const noop = () => {}

const stateKeys = { onDrag: 'drag', onHover: 'move', onMove: 'move', onPinch: 'pinch', onScroll: 'scroll', onWheel: 'wheel' }

const defaultConfig = {
  domTarget: undefined,
  event: { passive: true, capture: false, pointerEvents: false },
  window: typeof window !== 'undefined' ? window : undefined,
  transform: { x: x => x, y: y => y },
  enabled: true,
  drag: true,
  pinch: true,
  scroll: true,
  wheel: true,
  hover: true,
  move: true
}

const initialCommon = {
  event: undefined,
  delta: [0, 0],
  initial: [0, 0],
  previous: [0, 0],
  transform: undefined,
  local: [0, 0],
  lastLocal: [0, 0],
  first: true,
  last: false,
  active: true,
  time: undefined,
  temp: undefined,
  cancel: noop,
  canceled: false
}

const initialXY = { xy: [0, 0], velocity: 0, vxvy: [0, 0], distance: 0, direction: [0, 0] } // xy coordinates
const initialDA = { da: [0, 0], vdva: [0, 0], turns: 0 } // distance and angle

const initialState = {
  shared: {
    args: undefined,
    hovering: undefined,
    scrolling: undefined,
    dragging: undefined,
    moving: undefined,
    pinching: undefined,
    touches: undefined,
    down: undefined,
    shiftKey: undefined,
    altKey: undefined,
    metaKey: undefined,
    ctrlKey: undefined
  },
  move: { ...initialCommon, ...initialXY },
  drag: { ...initialCommon, ...initialXY },
  scroll: { ...initialCommon, ...initialXY },
  wheel: { ...initialCommon, ...initialXY },
  pinch: { ...initialCommon, ...initialDA }
}

const genericEndState = { last: true, active: false }

export default function useGesture(_props) {
  if (typeof _props === 'function') _props = { onDrag: _props }
  if (_props.onAction) {
    _props.onDrag = _props.onAction
    delete _props.onAction
  }
  _props = { ..._props, config: { ...defaultConfig, ..._props.config } }

  const props = React.useRef(_props)
  props.current = _props

  const state = React.useRef(initialState)
  const oldArgs = React.useRef([])
  const oldResult = React.useRef(null)
  const timeouts = React.useRef({})
  const domListeners = React.useRef([])
  const dragListeners = React.useRef([])

  const clean = React.useCallback(() => {
    clearTimeouts(timeouts.current)
    removeListeners(props.current.config.domTarget, domListeners.current, props.current.config.event)
    removeListeners(props.current.config.window, dragListeners.current, props.current.config.event)
  }, [])

  React.useEffect(() => clean, [clean])

  const [bind] = React.useState(() => (...args) => {
    const unchanged = oldArgs.current.length === args.length && args.every((arg, index) => arg === oldArgs.current[index])
    oldArgs.current = args
    if (!unchanged) {
      clean()
      oldResult.current = handlers(args)
    }
    return oldResult.current
  })

  return bind

  /*** HANDLERS ***/

  function handlers(args) {
    const {
      domTarget,
      event: { pointerEvents }
    } = props.current.config

    const actions = new Set(
      Object.keys(props.current)
        .filter(k => k.indexOf('on') === 0)
        .map(k => k.match(/(on[A-Z][a-z]+)/)[1])
    )

    const updateState = newState => {
      newState.shared = newState.shared || {}
      newState.shared.args = args
      const updatedState = Object.entries(newState).reduce((acc, [k, v]) => ({ ...acc, [k]: { ...state.current[k], ...v } }), {})
      state.current = { ...state.current, ...updatedState }
    }

    const getGenericStartState = (event, stateKey, xy) => {
      const transform = state.current[stateKey].transform || event.transform || props.current.config.transform
      const lastLocal = state.current[stateKey].local || initialState[stateKey].local
      return {
        ...initialState[stateKey],
        xy,
        initial: xy,
        previous: xy,
        local: lastLocal,
        lastLocal,
        transform,
        time: event.timeStamp
      }
    }

    const getKinematics = (mov_x, mov_y, event, stateKey, isDelta = false) => {
      const lastLocal = state.current[stateKey].lastLocal || initialState[stateKey].lastLocal
      const { xy, initial, delta, time, transform } = state.current[stateKey]
      const t = transform || event.transform || props.current.config.transform

      const delta_t = event.timeStamp - time

      const x = isDelta ? mov_x + xy[0] : mov_x
      const y = isDelta ? mov_y + xy[1] : mov_y
      const delta_x = t.x(isDelta ? mov_x + delta[0] : x - initial[0])
      const delta_y = t.y(isDelta ? mov_y + delta[1] : y - initial[1])

      const x_dist = t.x(x - xy[0])
      const y_dist = t.y(y - xy[1])
      const len = Math.hypot(x_dist, y_dist)
      const scalar = 1 / (len || 1)

      const local_x = lastLocal[0] + delta_x
      const local_y = lastLocal[1] + delta_y

      return {
        xy: [x, y],
        delta: [delta_x, delta_y],
        velocity: len / delta_t,
        vxvy: [x_dist / delta_t, y_dist / delta_t],
        distance: Math.hypot(delta_x, delta_y),
        direction: [x_dist * scalar, y_dist * scalar],
        local: [local_x, local_y],
        previous: xy,
        transform,
        time: event.timeStamp
      }
    }

    const handleGesture = action => {
      const stateKey = stateKeys[action]
      const actionState = { ...state.current.shared, ...state.current[stateKey] }
      if (props.current[action]) {
        state.current[stateKey].temp = props.current[action](actionState) || state.current[stateKey].temp
      }
    }

    const handleGestureStart = action => {
      const stateKey = stateKeys[action]
      const actionState = { ...state.current.shared, ...state.current[stateKey] }
      const actionStart = `${action}Start`
      props.current[actionStart] && props.current[actionStart](actionState)
      if (props.current[action]) {
        state.current[stateKey].temp = props.current[action](actionState) || state.current[stateKey].temp
      }
    }

    const handleGestureEnd = (action, callDefaultAction = true) => {
      const stateKey = stateKeys[action]
      const actionState = { ...state.current.shared, ...state.current[stateKey] }
      if (callDefaultAction && props.current[action]) {
        state.current[stateKey].temp = props.current[action](actionState) || state.current[stateKey].temp
      }
      const actionEnd = `${action}End`
      props.current[actionEnd] && props.current[actionEnd](actionState)
    }

    const onDragStart = event => {
      if (!props.current.config.enabled || !props.current.config.drag) return

      const { mov_x, mov_y, ...rest } = getPointerEventData(event)
      // making sure we're not dragging the element when more than one finger press the screen
      if (rest.touches > 1) return

      const { currentTarget, pointerId } = event
      if (pointerEvents) {
        currentTarget.setPointerCapture(pointerId)
      } else {
        dragListeners.current = []
        dragListeners.current.push(['mousemove', onDragMove])
        dragListeners.current.push(['mouseup', onDragEnd])
        dragListeners.current.push(['touchmove', onDragMove])
        dragListeners.current.push(['touchend', onDragEnd])
        dragListeners.current.push(['touchcancel', onDragEnd])
        addListeners(props.current.config.window, dragListeners.current, props.current.config.event)
      }

      const startState = getGenericStartState(event, 'drag', [mov_x, mov_y])

      updateState({
        shared: { ...rest, dragging: true, down: true },
        drag: { ...startState, event, currentTarget, pointerId, cancel: () => cancelDrag(event) }
      })

      handleGestureStart('onDrag')
    }

    const onDragEnd = (event, canceled = false) => {
      if (!state.current.shared.dragging) return

      const { currentTarget, pointerId } = state.current.drag
      if (pointerEvents) {
        currentTarget.releasePointerCapture(pointerId)
      } else {
        removeListeners(props.current.config.window, dragListeners.current, props.current.config.event)
      }
      updateState({ shared: { dragging: false, down: false, touches: 0 }, drag: { ...genericEndState, event, cancel: noop, canceled } })

      handleGestureEnd('onDrag')
    }

    const onDragMove = event => {
      if (state.current.drag.canceled || !state.current.shared.dragging) return

      const { mov_x, mov_y, ...rest } = getPointerEventData(event)
      const kinematics = getKinematics(mov_x, mov_y, event, 'drag')
      const cancel = () => cancelDrag(event)

      updateState({ shared: { moving: true, ...rest }, drag: { ...kinematics, event, cancel } })
      handleGesture('onDrag')
    }

    const cancelDrag = event => requestAnimationFrame(() => onDragEnd(event, true))

    const onPinchStart = event => {
      if (!props.current.config.enabled || !props.current.config.pinch || event.touches.length !== 2) return

      const dx = event.touches[1].clientX - event.touches[0].clientX
      const dy = event.touches[1].clientY - event.touches[0].clientY

      const lastLocal = state.current.pinch.local || initialState.pinch.local
      const transform = state.current.pinch.transform || event.transform || props.current.config.transform

      const da = [Math.hypot(dx, dy), (Math.atan2(dx, dy) * 180) / Math.PI]

      const startState = {
        ...initialState.pinch,
        da: da,
        initial: da,
        previous: da,
        local: lastLocal,
        lastLocal,
        transform,
        time: event.timeStamp
      }

      updateState({
        shared: { pinching: true, down: true, touches: 2 },
        pinch: { da: [0, 0], ...startState, event, cancel: () => cancelPinch(event) }
      })

      handleGestureStart('onPinch')
    }

    const onPinchEnd = (event, canceled = false) => {
      if (!state.current.shared.pinching) return
      updateState({ shared: { pinching: false, down: false, touches: 0 }, pinch: { ...genericEndState, event, cancel: noop, canceled } })
      handleGestureEnd('onPinch')
    }

    const onPinchMove = event => {
      if (state.current.pinch.canceled || event.touches.length !== 2) return
      const { da, turns, initial, lastLocal, time } = state.current.pinch

      const dx = event.touches[1].clientX - event.touches[0].clientX
      const dy = event.touches[1].clientY - event.touches[0].clientY
      const d = Math.hypot(dx, dy)
      const a = (Math.atan2(dx, dy) * 180) / Math.PI

      const d_dist = d - da[0]
      const a_dist = a - da[1]

      const newTurns = Math.abs(a_dist) > 300 ? turns + Math.sign(a_dist) : turns

      const delta_t = event.timeStamp - time
      const delta_d = Math.hypot(dx, dy) - initial[0]
      const delta_a = initial[1] - a + 360 * newTurns

      const local_d = lastLocal[0] + delta_d
      const local_a = lastLocal[1] + delta_a

      const cancel = () => cancelPinch(event)

      updateState({
        pinch: {
          da: [d, a],
          delta: [delta_d, delta_a],
          vdva: [d_dist / delta_t, a_dist / delta_t],
          turns: newTurns,
          previous: da,
          local: [local_d, local_a],
          event,
          time: event.timeStamp,
          cancel
        }
      })
      handleGesture('onPinch')
    }

    const cancelPinch = event => requestAnimationFrame(() => onPinchEnd(event, true))

    const onMoveEnd = () => {
      updateState({ shared: { moving: false }, move: { ...genericEndState, velocity: 0, vxvy: [0, 0] } })
      handleGestureEnd('onMove', false)
    }

    const onMove = event => {
      if (!props.current.config.enabled || !props.current.config.move) return
      clearTimeout(timeouts.current.move)
      timeouts.current.move = setTimeout(onMoveEnd, 100)

      const { mov_x, mov_y, ...rest } = getPointerEventData(event)

      if (!state.current.shared.moving) {
        const startState = getGenericStartState(event, 'move', [mov_x, mov_y])
        updateState({ shared: { moving: true, ...rest }, move: { ...startState, event } })
        return handleGestureStart('onMove')
      }

      const kinematics = getKinematics(mov_x, mov_y, event, 'move')
      updateState({ shared: rest, move: { ...kinematics, event } })
      handleGesture('onMove')
    }

    const onScrollEnd = () => {
      updateState({ shared: { scrolling: false }, scroll: { ...genericEndState, velocity: 0, vxvy: [0, 0] } })
      handleGestureEnd('onScroll')
    }

    const onScroll = event => {
      if (!props.current.config.enabled || !props.current.config.scroll) return
      clearTimeout(timeouts.current.scroll)
      timeouts.current.scroll = setTimeout(onScrollEnd, 100)
      const { mov_x, mov_y } = getScrollEventData(event)

      if (!state.current.shared.scrolling) {
        const startState = getGenericStartState(event, 'scroll', [mov_x, mov_y])
        updateState({ shared: { scrolling: true }, scroll: { ...startState, event } })
        return handleGestureStart('onScroll')
      }

      const kinematics = getKinematics(mov_x, mov_y, event, 'scroll')
      updateState({ scroll: { ...kinematics, event } })
      handleGesture('onScroll')
    }

    const onWheelEnd = () => {
      updateState({
        shared: { wheeling: false },
        wheel: { ...genericEndState, velocity: 0, vxvy: [0, 0] }
      })
      handleGestureEnd('onWheel')
    }

    const onWheel = event => {
      if (!props.current.config.enabled || !props.current.config.wheel) return
      clearTimeout(timeouts.current.wheel)
      timeouts.current.wheel = setTimeout(onWheelEnd, 100)
      const { mov_x, mov_y } = getWheelEventData(event)

      if (!state.current.shared.wheeling) {
        const startState = getGenericStartState(event, 'wheel', [mov_x, mov_y])
        updateState({ shared: { wheeling: true }, wheel: { ...startState, event } })
        return handleGestureStart('onWheel')
      }

      const kinematics = getKinematics(mov_x, mov_y, event, 'wheel', true)
      updateState({ wheel: { ...kinematics, event } })
      handleGesture('onWheel')
    }

    const onEnter = event => {
      if (!props.current.config.enabled || !props.current.config.hover) return
      const { mov_x, mov_y, down, touches, shiftKey } = getPointerEventData(event)
      updateState({
        shared: { hovering: true, down, touches, shiftKey },
        move: { xy: [mov_x, mov_y], event }
      })
      handleGesture('onHover')
    }

    const onLeave = event => {
      if (!props.current.config.enabled || !props.current.config.hover) return
      const { mov_x, mov_y, down, touches, shiftKey } = getPointerEventData(event)
      const kinematics = getKinematics(mov_x, mov_y, event, 'move')
      updateState({ shared: { hovering: false, down, touches, shiftKey }, move: { ...kinematics, event } })
      handleGesture('onHover')
    }

    const output = {}
    const capture = props.current.config.event.capture ? 'Capture' : ''
    const listeners = {}

    if (actions.has('onMove')) {
      pushEventProp(listeners, pointerEvents ? 'onPointerMove' : 'onMouseMove', onMove)
    }

    if (actions.has('onDrag')) {
      if (pointerEvents) {
        pushEventProp(listeners, 'onPointerDown', onDragStart)
        pushEventProp(listeners, 'onPointerMove', onDragMove)
        pushEventProp(listeners, ['onPointerUp', 'onPointerCancel'], onDragEnd)
      } else {
        pushEventProp(listeners, ['onMouseDown', 'onTouchStart'], onDragStart)
      }
    }

    if (actions.has('onPinch')) {
      pushEventProp(listeners, 'onTouchStart', onPinchStart)
      pushEventProp(listeners, 'onTouchMove', onPinchMove)
      pushEventProp(listeners, ['onTouchEnd', 'onTouchCancel'], onPinchEnd)
    }

    if (actions.has('onHover')) {
      pushEventProp(listeners, pointerEvents ? 'onPointerEnter' : 'onMouseEnter', onEnter)
      pushEventProp(listeners, pointerEvents ? 'onPointerLeave' : 'onMouseLeave', onLeave)
    }

    if (actions.has('onScroll')) {
      pushEventProp(listeners, 'onScroll', onScroll)
    }

    if (actions.has('onWheel')) {
      pushEventProp(listeners, 'onWheel', onWheel)
    }

    if (domTarget) {
      domListeners.current = []
      Object.entries(listeners).forEach(([k, fns]) => domListeners.current.push([k.substr(2).toLowerCase(), chain(...fns)]))
      addListeners(domTarget, domListeners.current, props.current.config.event)
      return clean
    }

    Object.entries(listeners).forEach(([k, fns]) => (output[k + capture] = chain(...fns)))
    return output
  }
}

/*** UTILS ***/

const chain = (...fns) => (...args) => fns.forEach(a => a(...args))
const pushEventProp = (l, keys, fn) => {
  if (!Array.isArray(keys)) keys = [keys]
  keys.forEach(key => (l[key] = l[key] ? [...l[key], fn] : [fn]))
}

const clearTimeouts = timeouts => Object.values(timeouts).forEach(clearTimeout)

const setListeners = add => (el, listeners, options) => {
  const action = add ? 'addEventListener' : 'removeEventListener'
  listeners.forEach(([type, fn]) => el[action](type, fn, options))
}

const addListeners = setListeners(true)
const removeListeners = setListeners(false)

function getScrollEventData(event) {
  // If the currentTarget is the window then we return the scrollX/Y position.
  // If not (ie the currentTarget is a DOM element), then we return scrollLeft/Top
  const { scrollX, scrollY, scrollLeft, scrollTop } = event.currentTarget
  return { mov_x: scrollX || scrollLeft || 0, mov_y: scrollY || scrollTop || 0 }
}

function getWheelEventData(event) {
  //TODO implement polyfill ?
  // https://developer.mozilla.org/en-US/docs/Web/Events/wheel#Polyfill
  return { mov_x: event.deltaX, mov_y: event.deltaY }
}

function getPointerEventData(event) {
  const { touches, changedTouches, shiftKey, altKey, metaKey, ctrlKey } = event
  const touchEvents = touches && touches.length > 0 ? touches : changedTouches && changedTouches.length > 0 ? changedTouches : null
  const { clientX: mov_x, clientY: mov_y, buttons } = touchEvents ? touchEvents[0] : event
  const down = (touchEvents && touchEvents.length > 0) || buttons % 2 === 1 // makes sure main button is pressed
  return { mov_x, mov_y, touches: (touchEvents && touchEvents.length) || 0, down, shiftKey, altKey, metaKey, ctrlKey }
}
