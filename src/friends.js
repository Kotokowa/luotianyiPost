export function initFriendLinks(root = document) {
  const wrapper = root.querySelector('.friend-links');
  if (!wrapper) return;
  const toggle = wrapper.querySelector('button');
  const panel = wrapper.querySelector('.friends-panel');
  let opened = false, hovered = false;
  function setOpen(value) {
    opened = value;wrapper.classList.toggle('is-open', value);
    toggle.setAttribute('aria-expanded', String(value));panel.inert = !value;
  }
  wrapper.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { hovered = true;setOpen(true); } });
  wrapper.addEventListener('pointerleave', () => { hovered = false;if (!wrapper.contains(document.activeElement)) setOpen(false); });
  wrapper.addEventListener('focusin', event => { if (event.target !== toggle || toggle.matches(':focus-visible')) setOpen(true); });
  wrapper.addEventListener('focusout', event => { if (!wrapper.contains(event.relatedTarget)) setOpen(false); });
  toggle.addEventListener('click', event => setOpen(event.detail > 0 && hovered ? true : !opened));
  wrapper.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault();event.stopPropagation();toggle.focus();setOpen(false); }
  });
  root.addEventListener('click', event => { if (!wrapper.contains(event.target)) setOpen(false); });
}
