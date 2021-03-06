import { def, matchKeysFromObject } from './utils'
import {
  Vector2,
  GenericOptions,
  InternalGenericOptions,
  DragConfig,
  Tuple,
  GestureOptions,
  DragOptions,
  InternalDragOptions,
  InternalGestureOptions,
  CoordinatesConfig,
  CoordinatesOptions,
  InternalCoordinatesOptions,
  DistanceAngleConfig,
  InternalDistanceAngleOptions,
} from '../types'

const DEFAULT_DRAG_DELAY = 180
const DEFAULT_RUBBERBAND = 0.15

function getWindow() {
  return typeof window !== 'undefined' ? window : undefined
}

/**
 * @private
 *
 * Returns the internal generic option object.
 *
 * @param {Partial<GenericOptions>} [config={}]
 * @returns {InternalGenericOptions}
 */
export function getInternalGenericOptions(config: Partial<GenericOptions> = {}): InternalGenericOptions {
  const defaultOptions: GenericOptions = {
    domTarget: undefined,
    eventOptions: { passive: true, capture: false, pointer: false },
    window: getWindow(),
    enabled: true,
  }

  const { eventOptions: defaultEventOptions, window: defaultWindow, ...restDefault } = defaultOptions
  const { eventOptions, window, ...restConfig } = config
  const { passive, capture, pointer } = { ...defaultEventOptions, ...eventOptions }

  return {
    ...restDefault,
    ...restConfig,
    window: window || defaultWindow,
    // passive is always true if there's no domTarget
    eventOptions: { passive: !config.domTarget || !!passive, capture: !!capture },
    captureString: capture ? 'Capture' : '',
    pointer: !!pointer,
  }
}

export function getInternalGestureOptions(gestureConfig: Partial<GestureOptions>): InternalGestureOptions {
  const defaultGestureOptions: GestureOptions = {
    enabled: true,
    initial: [0, 0],
    threshold: undefined,
    rubberband: 0,
  }

  const config = { ...defaultGestureOptions, ...gestureConfig }
  let { threshold, rubberband, enabled, initial } = config

  if (typeof rubberband === 'boolean') rubberband = rubberband ? DEFAULT_RUBBERBAND : 0
  if (threshold === void 0) threshold = 0

  return {
    enabled,
    initial,
    threshold: def.array(threshold) as Vector2,
    rubberband: def.array(rubberband) as Vector2,
  }
}

export function getInternalCoordinatesOptions(coordinatesConfig: CoordinatesConfig = {}): InternalCoordinatesOptions {
  const defaultCoordinatesOptions: CoordinatesOptions = {
    lockDirection: false,
    axis: undefined,
    bounds: undefined,
  }

  const { axis, lockDirection, bounds = {}, ...internalOptions } = coordinatesConfig

  const boundsArray = [
    [def.withDefault(bounds.left, -Infinity), def.withDefault(bounds.right, Infinity)],
    [def.withDefault(bounds.top, -Infinity), def.withDefault(bounds.bottom, Infinity)],
  ]

  return {
    ...getInternalGestureOptions(internalOptions),
    ...defaultCoordinatesOptions,
    ...matchKeysFromObject({ axis, lockDirection }, coordinatesConfig),
    bounds: boundsArray as Tuple<Vector2>,
  }
}

export function getInternalDistanceAngleOptions(
  distanceAngleConfig: DistanceAngleConfig = {}
): InternalDistanceAngleOptions {
  const { distanceBounds = {}, angleBounds = {}, ...internalOptions } = distanceAngleConfig

  const boundsArray = [
    [def.withDefault(distanceBounds.min, -Infinity), def.withDefault(distanceBounds.max, Infinity)],
    [def.withDefault(angleBounds.min, -Infinity), def.withDefault(angleBounds.max, Infinity)],
  ]

  return {
    ...getInternalGestureOptions(internalOptions),
    bounds: boundsArray as Tuple<Vector2>,
  }
}

export function getInternalDragOptions(dragConfig: DragConfig = {}): InternalDragOptions {
  const defaultDragOptions: DragOptions = {
    filterTaps: false,
    swipeVelocity: 0.5,
    swipeDistance: 60,
    delay: false,
  }

  let { enabled, threshold, bounds, rubberband, initial, ...dragOptions } = dragConfig
  let { swipeVelocity, swipeDistance, delay, filterTaps, axis, lockDirection } = {
    ...defaultDragOptions,
    ...dragOptions,
  }

  if (threshold === void 0) {
    threshold = Math.max(0, filterTaps ? 3 : 0, lockDirection || axis ? 1 : 0)
  } else {
    filterTaps = true
  }

  const internalCoordinatesOptions = getInternalCoordinatesOptions(
    matchKeysFromObject({ enabled, threshold, bounds, rubberband, axis, lockDirection, initial }, dragConfig)
  )

  return {
    ...internalCoordinatesOptions,
    filterTaps: filterTaps || internalCoordinatesOptions.threshold[0] + internalCoordinatesOptions.threshold[1] > 0,
    swipeVelocity: def.array(swipeVelocity) as Vector2,
    swipeDistance: def.array(swipeDistance) as Vector2,
    delay: typeof delay === 'number' ? delay : delay ? DEFAULT_DRAG_DELAY : 0,
  }
}
