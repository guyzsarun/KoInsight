import express from 'express';
import request from 'supertest';
import { createBook } from '../db/factories/book-factory';
import { db } from '../knex';
import { booksRouter } from './books-router';
import { createDevice } from '../db/factories/device-factory';
import { createAnnotation } from '../db/factories/annotation-factory';

describe('books-router', () => {
  const app = express();
  app.use(express.json());
  app.use('/books', booksRouter);

  describe('GET /books', () => {
    it('returns all books as JSON', async () => {
      await createBook(db, { title: 'Book 1' });

      let response = await request(app).get('/books');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toEqual(expect.objectContaining({ title: 'Book 1' }));

      await createBook(db, { title: 'Book 2' });

      response = await request(app).get('/books');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[1]).toEqual(expect.objectContaining({ title: 'Book 2' }));
    });

    it('excludes hidden books by default', async () => {
      await createBook(db, { title: 'Visible Book', soft_deleted: false });
      await createBook(db, { title: 'Hidden Book', soft_deleted: true });

      const response = await request(app).get('/books');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].title).toBe('Visible Book');
    });

    it('includes hidden books when showHidden=true', async () => {
      await createBook(db, { title: 'Visible Book', soft_deleted: false });
      await createBook(db, { title: 'Hidden Book', soft_deleted: true });

      const response = await request(app).get('/books?showHidden=true');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });
  });

  describe('GET /books/:bookId', () => {
    it('returns a book by id', async () => {
      const book = await createBook(db, { title: 'Test Book' });

      const response = await request(app).get(`/books/${book.id}`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual(expect.objectContaining({ title: 'Test Book' }));
    });
  });

  describe('GET /books/:bookId/annotations/export', () => {
    it('exports annotations as markdown and skips deleted ones', async () => {
      const book = await createBook(db, { title: 'Annotated Book' });
      const device = await createDevice(db);

      await createAnnotation(db, book, device, 'highlight', {
        text: 'A great quote',
        note: 'Remember this',
        chapter: 'Intro',
        pageno: 2,
      });

      // Soft-deleted annotation should not appear
      await db('annotation').insert({
        book_md5: book.md5,
        device_id: device.id,
        annotation_type: 'bookmark',
        page_ref: '3',
        datetime: new Date().toISOString(),
        deleted_at: new Date().toISOString(),
      });

      const response = await request(app).get(`/books/${book.id}/annotations/export`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/markdown');
      expect(response.headers['content-disposition']).toContain('annotations.md');
      expect(response.text).toContain('# Annotated Book');
      expect(response.text).toContain('**Highlight** (Page 2)');
      expect(response.text).toContain('Intro');
      expect(response.text).toContain('A great quote');
      expect(response.text).toContain('Note: Remember this');
      expect(response.text).not.toContain('bookmark');
    });

    it('handles no annotations gracefully', async () => {
      const book = await createBook(db, { title: 'Empty Book' });

      const response = await request(app).get(`/books/${book.id}/annotations/export`);

      expect(response.status).toBe(200);
      expect(response.text.trim()).toBe('# Empty Book');
    });

    it('renders annotations without optional fields', async () => {
      const book = await createBook(db, { title: 'Sparse Book' });
      const device = await createDevice(db);

      await db('annotation').insert({
        book_md5: book.md5,
        device_id: device.id,
        annotation_type: 'bookmark',
        page_ref: '1',
        datetime: new Date().toISOString(),
      });

      const response = await request(app).get(`/books/${book.id}/annotations/export`);

      expect(response.status).toBe(200);
      expect(response.text).toContain('**Bookmark**');
    });
  });

  describe('DELETE /books/:bookId', () => {
    it('deletes a book', async () => {
      const book = await createBook(db, { title: 'Book to Delete' });

      const response = await request(app).delete(`/books/${book.id}`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Book deleted' });
    });
  });

  describe('PUT /books/:bookId/hide', () => {
    it('hides a book', async () => {
      const book = await createBook(db, { title: 'Book to Hide', soft_deleted: false });

      const response = await request(app).put(`/books/${book.id}/hide`).send({ hidden: true });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Book hidden' });
    });

    it('shows a hidden book', async () => {
      const book = await createBook(db, { title: 'Hidden Book', soft_deleted: true });

      const response = await request(app).put(`/books/${book.id}/hide`).send({ hidden: false });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Book shown' });
    });

    it('returns 400 when hidden field is missing', async () => {
      const book = await createBook(db);

      const response = await request(app).put(`/books/${book.id}/hide`).send({});
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Missing required fields' });
    });
  });

  describe('POST /books/:bookId/genres', () => {
    it('adds a genre to a book', async () => {
      const book = await createBook(db);

      const response = await request(app)
        .post(`/books/${book.id}/genres`)
        .send({ genreName: 'Fantasy' });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Genre added' });
    });

    it('returns 400 when genreName is missing', async () => {
      const book = await createBook(db);

      const response = await request(app).post(`/books/${book.id}/genres`).send({});
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Missing required fields' });
    });
  });

  describe('PUT /books/:bookId/reference_pages', () => {
    it('updates reference pages', async () => {
      const book = await createBook(db, { reference_pages: 100 });

      const response = await request(app)
        .put(`/books/${book.id}/reference_pages`)
        .send({ reference_pages: 250 });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Reference pages updated' });
    });

    it('returns 400 when reference_pages is missing', async () => {
      const book = await createBook(db);

      const response = await request(app).put(`/books/${book.id}/reference_pages`).send({});
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Missing required fields' });
    });
  });
});
