
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 100;

export default function paginate(defaultLimit = DEFAULT_LIMIT) {
  return function (req, res, next) {
    const limitParam = parseInt(req.query.limit, 10);
    const pageParam = parseInt(req.query.page, 10);

    const limit = isNaN(limitParam) ? defaultLimit : Math.min(limitParam, MAX_LIMIT);
    const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;

    const skip = (page - 1) * limit;

    res.locals.pagination = { skip, limit, page };

    // Helper to build "next" and "prev" links (Arabic / English based on `lang` query)
    res.locals.buildLinks = function (totalCount, baseUrl = req.originalUrl.split('?')[0]) {
      const totalPages = Math.ceil(totalCount / limit) || 1;
      const lang = (req.query.lang || '').toLowerCase();
      const isArabic = lang === 'ar' || lang === 'ar-eg' || lang === 'arabic';

      const makeLink = (p) => `${baseUrl}?page=${p}&limit=${limit}`;

      const links = {
        currentPage: page,
        totalPages,
        limit,
        next: page < totalPages ? makeLink(page + 1) : null,
        prev: page > 1 ? makeLink(page - 1) : null,
        labelNext: isArabic ? 'التالي' : 'Next',
        labelPrev: isArabic ? 'السابق' : 'Previous',
      };

      return links;
    };

    next();
  };
}
