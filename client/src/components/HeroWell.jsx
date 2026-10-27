import styles from './HeroWell.module.css';

/** Miniatura studni na stronie głównej: spadający klocek i podskakujący skoczek. */
export default function HeroWell() {
  return (
    <div className={styles.well} aria-hidden="true">
      <div className={styles.stack}>
        <span style={{ '--c': '#7F8FC8', gridArea: '6 / 1' }} />
        <span style={{ '--c': '#7F8FC8', gridArea: '6 / 2' }} />
        <span style={{ '--c': '#7EB38E', gridArea: '6 / 4' }} />
        <span style={{ '--c': '#7EB38E', gridArea: '6 / 5' }} />
        <span style={{ '--c': '#7EB38E', gridArea: '5 / 5' }} />
        <span style={{ '--c': '#D19C70', gridArea: '5 / 1' }} />
      </div>
      <div className={styles.piece}>
        <span /><span /><span /><span />
      </div>
      <div className={styles.jumper}>
        <i />
      </div>
    </div>
  );
}
