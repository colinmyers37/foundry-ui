import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import styled from 'styled-components';
import debounce from 'lodash/debounce';

import { useSpring, a } from '@react-spring/web';
import { useDrag } from 'react-use-gesture';
import useMeasure from 'react-use-measure';
import { ResizeObserver } from '@juggle/resize-observer';

import fonts from '../../enums/fonts';
import { clamp } from '../../utils/math';
import { mergeRefs } from '../../utils/refs';

import {
  ValueProp,
  ContainerProps,
  HandleProps,
  HandleLabelProps,
  RangeSliderProps,
  SelectedRangeProps,
  DomainLabelProps,
} from './types';
import { useAccessibilityPreferences, useAnalytics, useTheme } from '../../context';
import { StyledBaseDiv } from '../../htmlElements';

export const Container = styled.div`
  ${({ showDomainLabels, hasHandleLabels, disabled, beingDragged = false }: ContainerProps) => `
    display: flex;
    position: relative;
    height: 1rem;
    width: 100%;

    ${fonts.body}

    user-select: none;

    ${beingDragged ? 'cursor: grabbing;' : ''}

    transition: filter .1s;

    ${
      disabled
        ? `
      filter: grayscale(1) contrast(.5) brightness(1.2);
      pointer-events: none;
    `
        : ''
    }

    ${
      showDomainLabels
        ? `
        top: -.5rem;
        margin-top: 1rem;
      `
        : ''
    };

    ${
      hasHandleLabels
        ? `
      top: -.75rem;
      margin-top: 1.5rem;
    `
        : ''
    };
  `}
`;

export const DragHandle = styled(a.div)`
  ${({ $beingDragged = false, color }: HandleProps) => {
    const { colors } = useTheme();
    const handleColor = color || colors.primary;
    return `
      position: absolute;
      
      width: 1rem;
      height: 1rem;
      align-self: center;
      left: -.5rem;

      background-color: ${handleColor};
      color: ${handleColor};
      border: .125rem solid ${colors.background};
      border-radius: 50%;
      
      touch-action: none;

      filter: url(#blur);

      cursor: ${$beingDragged ? 'grabbing' : 'grab'};
      z-index: 2;
    `;
  }}
`;

export const HandleLabel = styled.div`
  ${({ velocity = 0 }: HandleLabelProps) => {
    const { colors } = useTheme();
    return `
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%) rotate(${clamp(velocity, -45, 45)}deg);

      background-color: ${colors.background};
      border-radius: 4px;
      font-weight: bold;
      white-space: nowrap;

      pointer-events: none;
      z-index: 2;
    `;
  }}
`;

export const SlideRail = styled.div`
  ${() => {
    const { colors } = useTheme();
    return `
      position: absolute;
      width: 100%;
      height: 0.25rem;

      overflow: hidden;
      align-self: center;

      border-radius: 0.125rem;
      background-color: ${colors.grayXlight};
    `;
  }}
`;

export const SelectedRangeRail = styled(a.div)`
  ${({ min, max, selectedRangeValues, behavior, animateRangeRail }: SelectedRangeProps) => {
    const { colors } = useTheme(); // TODO: don't force the color to be primary
    return `
      position: absolute;
      top: 0%;
      height: 100%;

      ${
        behavior === 'followValue' &&
        `left: ${((selectedRangeValues[0] - min) / (max - min)) * 100}%;
          right: ${((max - selectedRangeValues[1]) / (max - min)) * 100}%;`
      }


      ${
        animateRangeRail
          ? `
      transition: left .3s, right .3s;
      `
          : ''
      }

      background-color: ${colors.primary};
    `;
  }}
`;

export const DomainLabel = styled.div`
  ${({ position }: DomainLabelProps) => {
    const { colors } = useTheme();
    return `
      position: absolute;
      bottom: 100%;
      ${position}: 0rem;
      color: ${colors.grayMedium};
      font-size: .5rem;
    `;
  }}
`;

export const Marker = styled(StyledBaseDiv)`
  ${({ sliderPosition = 0 }) => {
    const { colors } = useTheme();
    return `
      position: absolute;
      text-align: center;
      display: flex;
      justify-content: center;
      height: 1rem;
      width: 2px;
      left: ${sliderPosition}px;
      background-color: ${colors.grayLight};
    `;
  }}
`;
export const MarkerLabel = styled(StyledBaseDiv)`
  ${({ color }) => {
    const { colors } = useTheme();
    return `
    position: absolute;
    bottom: 100%;
    white-space: nowrap;
    font-size: .375rem;
    color: ${color || colors.grayLight};
  `;
  }}
`;

export const RangeSlider = ({
  StyledContainer = Container,
  StyledDragHandle = DragHandle,
  StyledHandleLabel = HandleLabel,
  StyledSlideRail = SlideRail,
  StyledSelectedRangeRail = SelectedRangeRail,
  StyledDomainLabel = DomainLabel,
  StyledMarker = Marker,
  StyledMarkerLabel = MarkerLabel,

  containerProps = {},
  dragHandleProps = {},
  handleLabelProps = {},
  slideRailProps = {},
  selectedRangeRailProps = {},
  domainLabelProps = {},
  markerProps = {},
  markerLabelProps = {},

  containerRef,
  dragHandleRef,
  slideRailRef,
  handleLabelRef,
  selectedRangeRailRef,
  domainLabelRef,
  markerRef,
  markerLabelRef,

  showDomainLabels = true,
  showSelectedRange = true,
  showHandleLabels = true,

  springOnRelease = true,

  debounceInterval = 8,
  onDrag,
  onChange,
  onDebounceChange,
  onRelease,

  disabled = false,
  min,
  max,
  values,
  markers = [],
  testId,
  selectedRangeBehavior = 'followHandle',
  snapToValue = false,
}: RangeSliderProps): JSX.Element | null => {
  if (onDrag) {
    // eslint-disable-next-line no-console
    console.warn(
      'From FoundryUI RangerSlider: onDrag callback is deprecated. Instead, use onChange or onDebounceChange.',
    );
  }

  const { prefersReducedMotion } = useAccessibilityPreferences();
  const initializing = useRef(true);

  const debouncedOnChange = useRef(
    debounce(newVal => {
      if (onDrag) onDrag(newVal);
      if (onDebounceChange) onDebounceChange(newVal);
    }, debounceInterval),
  ).current;

  const debouncedOnRelease = useRef(
    // wait an extra ms. onRelease should be called after onChange
    debounce(newVal => onRelease && onRelease(newVal), debounceInterval + 1),
  ).current;

  /** Convert passed-in `number` values into `ValueProps` */
  const processVal = (val: number | ValueProp): ValueProp =>
    typeof val === 'number' ? { value: val, label: undefined, color: undefined } : val;

  const processedValues: Array<ValueProp> = useMemo(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore expression not callable
    () => values?.map(processVal) ?? [],
    [values],
  );

  const processedMarkers: Array<ValueProp> = useMemo(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore expression not callable
    () => markers?.map(processVal) ?? [],
    [markers],
  );

  const hasHandleLabels = useMemo(
    () => processedValues?.some(val => val.label !== null && val.label !== undefined),
    [processedValues],
  );

  const domain = max - min;

  const handleEventWithAnalytics = useAnalytics();

  const handleDrag = useCallback(
    (newVal: number) =>
      handleEventWithAnalytics(
        'RangeSlider',
        () => {
          if (onChange) onChange(newVal);
          debouncedOnChange(newVal);
        },
        'onDrag',
        { type: 'onDrag', newVal },
        containerProps,
      ),
    [handleEventWithAnalytics, debouncedOnChange, onChange, containerProps],
  );

  // set the drag value asynchronously at a lower frequency for better performance
  const valueBuffer = useRef(0);

  // keep track of which handle is being dragged (if any)
  const [draggedHandle, setDraggedHandle] = useState(-1);
  // get the bounding box of the slider

  const [ref, sliderBounds] = useMeasure({ polyfill: ResizeObserver });
  const pixelPositions = processedValues.map(val => {
    return (val.value / domain) * sliderBounds.width;
  });

  // get the x offset and an animation setter function
  const [{ dragHandleX }, springRef] = useSpring(() => ({
    to: { dragHandleX: pixelPositions[0] },
    friction: 13,
    tension: 100,
    immediate: prefersReducedMotion,
  }));

  const handleSlideRailClick = useCallback(
    (e: React.MouseEvent) => {
      // Avoiding using another ref here to reduce overhead
      const pixelPosition = e.clientX;
      const positionOnRail = pixelPosition - sliderBounds.left;
      const railPositionRatio = positionOnRail / sliderBounds.width;
      const clickedValue = railPositionRatio * domain;

      // variables to find the closest handle
      let closestVal: number | ValueProp | undefined;
      let smallestDifference: number;

      // Find the closest handle
      processedValues.forEach(val => {
        const finalVal = typeof val === 'number' ? val : val.value;
        // Get the absolute value of the difference
        const difference = Math.abs(clickedValue - finalVal);
        if (smallestDifference !== undefined && difference < smallestDifference) {
          closestVal = val;
          smallestDifference = difference;
        } else if (smallestDifference === undefined) {
          closestVal = val;
          smallestDifference = difference;
        }
      });

      if (closestVal) {
        if (onDrag) onDrag(clickedValue);
        if (onChange) onChange(clickedValue);
        if (onDebounceChange) onDebounceChange(clickedValue);
        if (onRelease) onRelease(clickedValue);

        if (slideRailProps.onMouseDown && typeof slideRailProps.onMouseDown === 'function') {
          e.persist();
          slideRailProps.onMouseDown(e);
        }
      }
    },
    [
      slideRailProps,
      sliderBounds,
      onChange,
      onDebounceChange,
      onRelease,
      onDrag,
      domain,
      processedValues,
    ],
  );
  const handleSlideRailClickWithAnalytics = (e: MouseEvent) =>
    handleEventWithAnalytics('RangeSlider', handleSlideRailClick, 'onClick', e, containerProps);

  const bind = useDrag(
    ({ down, movement: [deltaX] }) => {
      const delta = (deltaX / sliderBounds.width) * domain;
      valueBuffer.current = clamp(delta, min, max);

      setDraggedHandle(down ? 0 : -1);
      handleDrag(valueBuffer.current);
      springRef.start({
        // Should handle follow value or drag gesture?
        dragHandleX: snapToValue || !down ? pixelPositions[0] : deltaX,

        immediate: prefersReducedMotion || !snapToValue || springOnRelease ? down : true,
        config: { friction: 13, tension: 100 },
      });
    },
    {
      initial: [pixelPositions[0], 0],
      threshold: 1,
      bounds: {
        left: 0,
        right: sliderBounds.width + 4,
        top: -8,
        bottom: sliderBounds.height / 2 + 8,
      },
      rubberband: 0.1,
    },
  );

  // Snap to initial position on first render.
  useEffect(() => {
    console.log('Animating immediately to ', pixelPositions[0]);

    springRef.start({
      dragHandleX: pixelPositions[0],

      immediate: true,
      config: { friction: 13, tension: 100 },
      onRest: () => {
        // wait for the first "set" to finish before turning off immediate mode
        initializing.current = false;
      },
    });
  }, [springRef, springOnRelease, prefersReducedMotion]);

  return (
    <StyledContainer
      data-test-id={['hs-ui-range-slider', testId].join('-')}
      disabled={disabled}
      hasHandleLabels={hasHandleLabels}
      showHandleLabels={showHandleLabels}
      showDomainLabels={showDomainLabels}
      ref={containerRef}
      {...containerProps}
    >
      <StyledSlideRail
        ref={mergeRefs([slideRailRef, ref])}
        {...slideRailProps}
        onMouseDown={handleSlideRailClickWithAnalytics}
      >
        {showSelectedRange && values && (
          <StyledSelectedRangeRail
            min={min}
            max={max}
            values={processedValues}
            selectedValueRange={[
              // min value
              values.length === 1 ? min : Math.min(...processedValues.map(e => e.value)),
              // max value
              Math.max(...processedValues.map(e => e.value)),
            ]}
            behavior={selectedRangeBehavior}
            style={
              selectedRangeBehavior === 'followHandle'
                ? {
                    width: dragHandleX,
                  }
                : undefined
            }
            animateRangeRail={!prefersReducedMotion}
            ref={selectedRangeRailRef}
            {...selectedRangeRailProps}
          />
        )}
      </StyledSlideRail>

      {showDomainLabels && (
        <>
          <StyledDomainLabel position="left" ref={domainLabelRef} {...domainLabelProps}>
            {min}
          </StyledDomainLabel>
          <StyledDomainLabel position="right" {...domainLabelProps}>
            {max}
          </StyledDomainLabel>
        </>
      )}

      {processedValues.map(({ value, color, label }, i) => (
        <StyledDragHandle
          // eslint-disable-next-line react/jsx-props-no-spreading
          {...bind()}
          draggable={false}
          $beingDragged={i === draggedHandle}
          style={{ x: dragHandleX }}
          color={color}
          // eslint-disable-next-line react/no-array-index-key
          key={`handle${i}`}
          ref={dragHandleRef}
          onMouseUp={() => debouncedOnRelease(value)}
          {...dragHandleProps}
        >
          {showHandleLabels && (
            <StyledHandleLabel value={value} ref={handleLabelRef} {...handleLabelProps}>
              {label}
            </StyledHandleLabel>
          )}
        </StyledDragHandle>
      ))}

      {processedMarkers.map(({ value, color, label }) => (
        <StyledMarker
          key={`marker-${value}`}
          id={`marker-${value}`}
          sliderPosition={(value / domain) * sliderBounds.width}
          ref={markerRef}
          {...markerProps}
        >
          <StyledMarkerLabel color={color} ref={markerLabelRef} {...markerLabelProps}>
            {label}
          </StyledMarkerLabel>
        </StyledMarker>
      ))}
    </StyledContainer>
  );
};

RangeSlider.Container = Container;
RangeSlider.DragHandle = DragHandle;
RangeSlider.HandleLabel = HandleLabel;
RangeSlider.SlideRail = SlideRail;
RangeSlider.SelectedRangeRail = SelectedRangeRail;
RangeSlider.DomainLabel = DomainLabel;
RangeSlider.Marker = Marker;
RangeSlider.MarkerLabel = MarkerLabel;

export default RangeSlider;
