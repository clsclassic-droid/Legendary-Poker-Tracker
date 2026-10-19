import { useEffect } from 'react';

// UI navigation only. The caller supplies exactly the tabs the user may access.
export default function MobileGestures({ tab, ids, onNavigate }) {
  useEffect(() => {
    let gesture = null;
    const hasHorizontalScroll = target => {
      for (let e = target; e && e !== document.body; e = e.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth + 2) return true;
      }
      return false;
    };
    const canScrollUp = target => {
      for (let e = target; e && e !== document.body; e = e.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight && e.scrollTop > 0) return true;
      }
      return (document.scrollingElement?.scrollTop || 0) > 0;
    };
    const start = e => {
      if (e.touches.length !== 1) { gesture = null; return; }
      const target = e.target instanceof Element ? e.target : e.target.parentElement;
      const t = e.touches[0];
      gesture = { x:t.clientX, y:t.clientY, target, started:Date.now(), blocked:!target.closest('main') || !!target.closest('input,textarea,select,button,a,[contenteditable="true"],[role="slider"]') || hasHorizontalScroll(target) || ['add','settings','login'].includes(tab), vertical:false };
    };
    const move = e => {
      if (!gesture || e.touches.length !== 1) { gesture = null; return; }
      const dx = e.touches[0].clientX - gesture.x, dy = e.touches[0].clientY - gesture.y;
      if (Math.abs(dy) > 16 && Math.abs(dy) > Math.abs(dx)) gesture.vertical = true;
      // Prevent only downward overscroll at the top, preserving normal scrolling and pinch zoom.
      if (dy > 8 && dy > Math.abs(dx) && !canScrollUp(gesture.target) && e.cancelable) e.preventDefault();
      if (!gesture.blocked && !gesture.vertical && Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.5 && e.cancelable) e.preventDefault();
    };
    const end = e => {
      const g = gesture; gesture = null;
      if (!g || g.blocked || g.vertical || e.changedTouches.length !== 1 || Date.now()-g.started > 1200) return;
      const dx = e.changedTouches[0].clientX-g.x, dy=e.changedTouches[0].clientY-g.y;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy)*1.5) return;
      const current = ids.indexOf(tab), next = current + (dx < 0 ? 1 : -1);
      if (current >= 0 && next >= 0 && next < ids.length) onNavigate(ids[next]);
    };
    const cancel = () => { gesture = null; };
    document.addEventListener('touchstart',start,{passive:true});
    document.addEventListener('touchmove',move,{passive:false});
    document.addEventListener('touchend',end,{passive:true});
    document.addEventListener('touchcancel',cancel,{passive:true});
    return () => {
      document.removeEventListener('touchstart',start); document.removeEventListener('touchmove',move);
      document.removeEventListener('touchend',end); document.removeEventListener('touchcancel',cancel);
    };
  }, [tab, ids, onNavigate]);
  return null;
}
