import { ROLES } from '@studnia/shared/protocol';

export const ROLE_INFO = {
  [ROLES.TETRIS]: {
    label: 'Tetris',
    goal: 'Zmiażdż skoczka klockami albo zepchnij go do lawy.',
    keys: [
      ['← →', 'przesuwanie'],
      ['↑', 'obrót'],
      ['↓', 'szybciej w dół'],
      ['Spacja', 'zrzut', 'hardDrop'],
    ],
  },
  [ROLES.JUMPER]: {
    label: 'Skoczek',
    goal: 'Skacz po klockach i przetrwaj do końca rundy.',
    keys: [
      ['← →', 'bieg'],
      ['↑ lub Spacja', 'skok'],
      ['↑ przy ścianie', 'odbicie'],
    ],
    tip: 'Uważaj na 2 pola lawy na dnie — w każdej rundzie leżą gdzie indziej. Widzisz tylko kawałek studni.',
  },
};

export const RESULT_COPY = {
  crush: { title: 'Zmiażdżony!', line: 'Klocek trafił skoczka.' },
  time: { title: 'Przetrwał!', line: 'Skoczek dotrwał do końca rundy.' },
  full: { title: 'Studnia pełna', line: 'Klocki sięgnęły sufitu.' },
  floor: { title: 'Lawa!', line: 'Skoczek wpadł do lawy.' },
};

export const otherRole = (role) => (role === ROLES.TETRIS ? ROLES.JUMPER : ROLES.TETRIS);

/** Klawisze roli z uwzględnieniem reguł (np. zrzut tylko przy zgodzie obu graczy). */
export const roleKeys = (role, rules = {}) =>
  ROLE_INFO[role].keys.filter(([, , rule]) => !rule || rules[rule]);
