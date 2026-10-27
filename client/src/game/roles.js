import { ROLES } from '@studnia/shared/protocol';

export const ROLE_INFO = {
  [ROLES.TETRIS]: {
    label: 'Tetris',
    goal: 'Zmiażdż skoczka klockami albo zepchnij go na zabójcze dno.',
    keys: [
      ['← →', 'przesuwanie'],
      ['↑', 'obrót'],
      ['↓', 'szybciej w dół'],
      ['Spacja', 'zrzut'],
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
    tip: 'Dno jest zabójcze — stój na klockach albo na dwóch jasnych półkach (po 2 kratki). Widzisz tylko kawałek studni.',
  },
};

export const RESULT_COPY = {
  crush: { title: 'Zmiażdżony!', line: 'Klocek trafił skoczka.' },
  time: { title: 'Przetrwał!', line: 'Skoczek dotrwał do końca rundy.' },
  full: { title: 'Studnia pełna', line: 'Klocki sięgnęły sufitu.' },
  floor: { title: 'Na dnie!', line: 'Skoczek dotknął zabójczego dna.' },
};

export const otherRole = (role) => (role === ROLES.TETRIS ? ROLES.JUMPER : ROLES.TETRIS);
