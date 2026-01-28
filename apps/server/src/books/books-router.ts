import { NextFunction, Request, Response, Router } from 'express';
import { BooksRepository } from './books-repository';
import { BooksService } from './books-service';
import { coversRouter } from './covers/covers-router';
import { getBookById } from './get-book-by-id-middleware';

const router = Router();

router.use('/:bookId/cover', coversRouter);

/**
 * Get all books with attached entity data
 */
router.get('/', async (req: Request, res: Response) => {
  const returnDeleted = Boolean(req.query.showHidden && req.query.showHidden === 'true');
  const books = await BooksRepository.getAllWithData(returnDeleted);
  res.status(200).json(books);
});

/**
 * Get a book with attached entity data by ID
 */
router.get('/:bookId', getBookById, async (req: Request, res: Response, next: NextFunction) => {
  const book = req.book!;
  const includeDeleted = req.query.includeDeleted === 'true';
  const bookWithData = await BooksService.withData(book, includeDeleted);
  res.status(200).json(bookWithData);
});

/**
 * Export a book's annotations as Markdown
 */
router.get('/:bookId/annotations/export', getBookById, async (req: Request, res: Response) => {
  const book = req.book!;
  try {
    const annotations = await BooksService.withData(book);
    const activeAnnotations = annotations.annotations.filter((a) => !a.deleted);

    const escapeMd = (value: string) =>
      value.replace(/([\\\\`*_[\\]{}()#+\\-.!>])/g, '\\\\$1');

    const safeTitle = escapeMd(book.title);
    const lines: string[] = [`# ${safeTitle}`, ''];

    activeAnnotations.forEach((annotation) => {
      const typeLabel =
        annotation.annotation_type.charAt(0).toUpperCase() + annotation.annotation_type.slice(1);
      const pagePart = annotation.pageno ? ` (Page ${annotation.pageno})` : '';
      const chapterPart = annotation.chapter ? ` - ${escapeMd(annotation.chapter)}` : '';

      let line = `- **${typeLabel}**${pagePart}${chapterPart}`;
      if (annotation.text) {
        line += `: ${escapeMd(annotation.text)}`;
      }
      lines.push(line);

      if (annotation.note) {
        lines.push(`  - Note: ${escapeMd(annotation.note)}`);
      }
    });

    const filenameBase = book.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 100);
    const filename = `${filenameBase || 'book'}-annotations.md`;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);
    res.status(200).send(lines.join('\n'));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to export annotations' });
  }
});

/**
 * Delete a book by ID
 */
router.delete('/:bookId', getBookById, async (req: Request, res: Response) => {
  const book = req.book!;

  try {
    await BooksRepository.delete(book);
    res.status(200).json({ message: 'Book deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete book' });
  }
});

router.put('/:bookId/hide', getBookById, async (req: Request, res: Response) => {
  const book = req.book!;
  const hidden = req.body.hidden;

  if (hidden === undefined || hidden === null) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    await BooksRepository.softDelete(book.id, hidden);
    res.status(200).json({ message: `Book ${hidden ? 'hidden' : 'shown'}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update book visibility' });
  }
});

/**
 * Adds a new genre to a book
 */
router.post('/:bookId/genres', getBookById, async (req: Request, res: Response) => {
  const book = req.book!;
  const { genreName } = req.body;

  if (!genreName) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    await BooksRepository.addGenre(book.md5, genreName);
    res.status(200).json({ message: 'Genre added' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add genre' });
  }
});

/**
 * Updates a book's reference pages
 */
router.put('/:bookId/reference_pages', getBookById, async (req: Request, res: Response) => {
  const book = req.book!;
  const { reference_pages } = req.body;

  if (reference_pages === undefined || reference_pages === null) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    await BooksRepository.setReferencePages(book.id, reference_pages);
    res.status(200).json({ message: 'Reference pages updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update reference pages' });
  }
});

export { router as booksRouter };
