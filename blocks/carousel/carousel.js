import { createOptimizedPicture } from '../../scripts/aem.js';

function createControls(carousel, slides) {
  const controls = document.createElement('div');
  controls.className = 'carousel-controls';

  const prev = document.createElement('button');
  prev.className = 'carousel-prev';
  prev.setAttribute('aria-label', 'Previous slide');
  prev.innerHTML = '&#8592;';

  const next = document.createElement('button');
  next.className = 'carousel-next';
  next.setAttribute('aria-label', 'Next slide');
  next.innerHTML = '&#8594;';

  const dots = document.createElement('div');
  dots.className = 'carousel-dots';

  let current = 0;

  function goTo(index) {
    slides[current].setAttribute('aria-hidden', 'true');
    slides[current].classList.remove('active');
    dots.children[current]?.classList.remove('active');

    current = (index + slides.length) % slides.length;

    slides[current].removeAttribute('aria-hidden');
    slides[current].classList.add('active');
    dots.children[current]?.classList.add('active');

    carousel.querySelector('.carousel-track').style.transform = `translateX(-${current * 100}%)`;
  }

  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'carousel-dot';
    dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
    if (i === 0) dot.classList.add('active');
    dot.addEventListener('click', () => goTo(i));
    dots.append(dot);
  });

  prev.addEventListener('click', () => goTo(current - 1));
  next.addEventListener('click', () => goTo(current + 1));

  controls.append(prev, dots, next);
  return controls;
}

export default function decorate(block) {
  const rows = [...block.children];
  if (!rows.length) return;

  const track = document.createElement('div');
  track.className = 'carousel-track';

  const slides = rows.map((row, i) => {
    const slide = document.createElement('div');
    slide.className = 'carousel-slide';
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-label', `Slide ${i + 1} of ${rows.length}`);
    if (i !== 0) slide.setAttribute('aria-hidden', 'true');
    else slide.classList.add('active');

    // Optimize images
    row.querySelectorAll('picture > img').forEach((img) => {
      img.closest('picture').replaceWith(
        createOptimizedPicture(img.src, img.alt, i === 0, [{ width: '750' }, { width: '1200' }]),
      );
    });

    slide.append(...row.children);
    return slide;
  });

  track.append(...slides);

  block.setAttribute('role', 'region');
  block.setAttribute('aria-label', 'Carousel');
  block.replaceChildren(track);

  if (slides.length > 1) {
    block.append(createControls(block, slides));
  }
}
