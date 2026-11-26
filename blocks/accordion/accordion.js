export default function decorate(block) {
  [...block.children].forEach((row) => {
    const [questionCell, answerCell] = [...row.children];
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.className = 'accordion-question';
    summary.textContent = questionCell?.textContent?.trim() || '';

    const body = document.createElement('div');
    body.className = 'accordion-answer';
    if (answerCell) {
      body.innerHTML = answerCell.innerHTML;
    }

    details.append(summary, body);
    row.replaceWith(details);
  });
}
