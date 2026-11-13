import { createOptimizedPicture } from '../../scripts/aem.js';

export default function decorate(block) {
  const isVideo = block.classList.contains('video');
  const rows = [...block.children];
  if (!rows.length) return;

  const [mediaCell, textCell] = [...rows[0].children];

  if (isVideo && mediaCell) {
    const link = mediaCell.querySelector('a');
    if (link) {
      const video = document.createElement('video');
      video.setAttribute('autoplay', '');
      video.setAttribute('muted', '');
      video.setAttribute('loop', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('aria-hidden', 'true');
      const source = document.createElement('source');
      source.src = link.href;
      source.type = link.href.endsWith('.webm') ? 'video/webm' : 'video/mp4';
      video.append(source);

      const pauseBtn = document.createElement('button');
      pauseBtn.className = 'hero-video-pause';
      pauseBtn.setAttribute('aria-label', 'Pause background video');
      pauseBtn.textContent = 'Pause';
      pauseBtn.addEventListener('click', () => {
        if (video.paused) {
          video.play();
          pauseBtn.textContent = 'Pause';
          pauseBtn.setAttribute('aria-label', 'Pause background video');
        } else {
          video.pause();
          pauseBtn.textContent = 'Play';
          pauseBtn.setAttribute('aria-label', 'Play background video');
        }
      });

      mediaCell.replaceChildren(video, pauseBtn);
    }
  } else if (mediaCell) {
    mediaCell.querySelectorAll('picture > img').forEach((img) => {
      img.closest('picture').replaceWith(
        createOptimizedPicture(img.src, img.alt, true, [{ width: '1200' }, { width: '750' }]),
      );
    });
  }

  if (textCell) {
    textCell.querySelectorAll('strong a, em a').forEach((a) => {
      a.classList.add('button');
      if (a.closest('strong')) a.classList.add('primary');
    });
  }
}
