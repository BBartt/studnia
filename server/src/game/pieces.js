export const SHAPES = Object.freeze({
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
});

/** Obrót macierzy o 90° zgodnie z ruchem wskazówek zegara. */
export const rotate = (m) => m[0].map((_, i) => m.map((row) => row[i]).reverse());

/** Losowanie „7-bag”: każdy z 7 klocków raz na worek, bez długich serii. */
export function createBag(random = Math.random) {
  let bag = [];
  return {
    next() {
      if (bag.length === 0) {
        bag = Object.keys(SHAPES);
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
      }
      return bag.pop();
    },
  };
}
