/**
 * QuickSort para objetos "carta".
 *
 * Este archivo NO toca el DOM: sólo emite eventos (tipo "juego") para que la UI
 * renderice comparaciones, movimientos a la izquierda/derecha, y el merge final.
 */

/**
 * @typedef {Object} Card
 * @property {string} id - Identificador único.
 * @property {number} value - Valor numérico para ordenar.
 * @property {string=} imageUrl - URL (por ejemplo dataURL) para la imagen de la carta.
 */

/**
 * Crea un "stream" (generator) de eventos del QuickSort.
 *
 * @param {Card[]} cards
 * @param {(a: Card, b: Card) => number} compare
 * @param {{ manualPivot?: boolean }} options
 *   manualPivot: si true, emite `pickPivotRequest` y espera el id del pivote vía gen.next(pivotId).
 */
export function* quickSortCardEvents(cards, compare, { manualPivot = false } = {}) {
  let callSeq = 0;

  /**
   * @param {Card[]} subArray
   * @param {number} depth
   * @param {string|null} parentCallId
   * @returns {Generator<any, Card[], string|undefined>}
   */
  function* sort(subArray, depth, parentCallId = null) {
    const callId = `call_${callSeq++}`;

    yield {
      type: "callStart",
      callId,
      parentCallId,
      depth,
      cardIds: subArray.map((c) => c.id),
      cardValues: subArray.map((c) => c.value),
    };

    if (subArray.length <= 1) {
      yield {
        type: "callBase",
        callId,
        depth,
        cardIds: subArray.map((c) => c.id),
        cardValues: subArray.map((c) => c.value),
      };
      return subArray;
    }

    let pivotIndex = 0;

    if (manualPivot) {
      const pivotId = yield {
        type: "pickPivotRequest",
        callId,
        depth,
        cardIds: subArray.map((c) => c.id),
        cardValues: subArray.map((c) => c.value),
      };

      const idx = subArray.findIndex((c) => c.id === pivotId);
      pivotIndex = idx >= 0 ? idx : 0;
    }

    const pivot = subArray[pivotIndex];
    const left = [];
    const right = [];

    yield {
      type: "pivotSelected",
      callId,
      depth,
      pivotId: pivot.id,
      pivotValue: pivot.value,
      manual: manualPivot,
    };

    for (let i = 0; i < subArray.length; i++) {
      if (i === pivotIndex) continue;

      const current = subArray[i];
      yield {
        type: "compare",
        callId,
        depth,
        pivotId: pivot.id,
        pivotValue: pivot.value,
        currentId: current.id,
        currentValue: current.value,
      };

      if (compare(current, pivot) < 0) {
        left.push(current);
        yield {
          type: "move",
          callId,
          depth,
          cardId: current.id,
          cardValue: current.value,
          to: "left",
        };
      } else {
        right.push(current);
        yield {
          type: "move",
          callId,
          depth,
          cardId: current.id,
          cardValue: current.value,
          to: "right",
        };
      }
    }

    yield {
      type: "partitionDone",
      callId,
      depth,
      leftIds: left.map((c) => c.id),
      leftValues: left.map((c) => c.value),
      rightIds: right.map((c) => c.id),
      rightValues: right.map((c) => c.value),
    };

    const sortedLeft = yield* sort(left, depth + 1, callId);
    const sortedRight = yield* sort(right, depth + 1, callId);

    const result = [...sortedLeft, pivot, ...sortedRight];

    yield {
      type: "callComplete",
      callId,
      depth,
      resultIds: result.map((c) => c.id),
      resultValues: result.map((c) => c.value),
    };

    return result;
  }

  const sorted = yield* sort(cards, 0);
  yield {
    type: "rootComplete",
    cardIds: sorted.map((c) => c.id),
    cardValues: sorted.map((c) => c.value),
  };
  return sorted;
}
