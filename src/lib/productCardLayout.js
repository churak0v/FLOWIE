export const PRODUCT_CARD_IMAGE_RATIO = '1 / 1';
export const PRODUCT_CARD_TITLE_LINES = 2;

export function getProductCardLayout(view = 'grid') {
  const isList = view === 'list';

  return {
    isList,
    imageFrame: isList
      ? {
          width: 'clamp(140px, 44vw, 172px)',
          minHeight: 'clamp(140px, 44vw, 172px)',
        }
      : {
          width: '100%',
          aspectRatio: PRODUCT_CARD_IMAGE_RATIO,
        },
    image: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    },
    title: isList
      ? { display: 'block', height: 'auto' }
      : {
          display: '-webkit-box',
          height: '2.32em',
          WebkitLineClamp: PRODUCT_CARD_TITLE_LINES,
          WebkitBoxOrient: 'vertical',
        },
  };
}
