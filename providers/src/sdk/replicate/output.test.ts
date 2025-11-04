import { describe, expect, it } from 'vitest';
import { normalizeReplicateOutput } from './output.js';

describe('normalizeReplicateOutput', () => {
  describe('null and undefined handling', () => {
    it('returns empty array for null', () => {
      expect(normalizeReplicateOutput(null)).toEqual([]);
    });

    it('returns empty array for undefined', () => {
      expect(normalizeReplicateOutput(undefined)).toEqual([]);
    });
  });

  describe('string URL handling', () => {
    it('returns array with single string URL', () => {
      const url = 'https://example.com/image.jpg';
      expect(normalizeReplicateOutput(url)).toEqual([url]);
    });

    it('returns empty array for empty string', () => {
      expect(normalizeReplicateOutput('')).toEqual([]);
    });

    it('handles array of string URLs', () => {
      const urls = [
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg',
        'https://example.com/image3.jpg',
      ];
      expect(normalizeReplicateOutput(urls)).toEqual(urls);
    });

    it('filters out empty strings from array', () => {
      const urls = ['https://example.com/image1.jpg', '', 'https://example.com/image2.jpg'];
      expect(normalizeReplicateOutput(urls)).toEqual([
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg',
      ]);
    });
  });

  describe('file object with url property (string)', () => {
    it('extracts url from object with url property', () => {
      const output = { url: 'https://example.com/file.mp3' };
      expect(normalizeReplicateOutput(output)).toEqual(['https://example.com/file.mp3']);
    });

    it('handles array of objects with url property', () => {
      const output = [
        { url: 'https://example.com/file1.mp3' },
        { url: 'https://example.com/file2.mp3' },
      ];
      expect(normalizeReplicateOutput(output)).toEqual([
        'https://example.com/file1.mp3',
        'https://example.com/file2.mp3',
      ]);
    });
  });

  describe('file object with url() method returning URL object', () => {
    it('extracts href from URL object returned by url() method', () => {
      const urlObject = new URL('https://example.com/file.mp3');
      const fileObject = {
        url: () => urlObject,
      };
      expect(normalizeReplicateOutput(fileObject)).toEqual(['https://example.com/file.mp3']);
    });

    it('handles array of file objects with url() methods', () => {
      const fileObjects = [
        { url: () => new URL('https://example.com/file1.mp3') },
        { url: () => new URL('https://example.com/file2.mp3') },
      ];
      expect(normalizeReplicateOutput(fileObjects)).toEqual([
        'https://example.com/file1.mp3',
        'https://example.com/file2.mp3',
      ]);
    });

    it('handles mixed array of strings and file objects', () => {
      const mixed = [
        'https://example.com/direct.mp3',
        { url: () => new URL('https://example.com/method.mp3') },
        { url: 'https://example.com/property.mp3' },
      ];
      expect(normalizeReplicateOutput(mixed)).toEqual([
        'https://example.com/direct.mp3',
        'https://example.com/method.mp3',
        'https://example.com/property.mp3',
      ]);
    });
  });

  describe('edge cases', () => {
    it('handles empty array', () => {
      expect(normalizeReplicateOutput([])).toEqual([]);
    });

    it('ignores objects without url property', () => {
      const output = [{ foo: 'bar' }, { url: 'https://example.com/valid.mp3' }];
      expect(normalizeReplicateOutput(output)).toEqual(['https://example.com/valid.mp3']);
    });

    it('ignores objects with url property that is not string or function', () => {
      const output = [{ url: 123 }, { url: 'https://example.com/valid.mp3' }];
      expect(normalizeReplicateOutput(output)).toEqual(['https://example.com/valid.mp3']);
    });

    it('handles url() method returning string', () => {
      const output = [
        { url: () => 'https://example.com/string.mp3' },
        { url: () => new URL('https://example.com/valid.mp3') },
      ];
      expect(normalizeReplicateOutput(output)).toEqual([
        'https://example.com/string.mp3',
        'https://example.com/valid.mp3',
      ]);
    });

    it('handles url() method returning object with href property', () => {
      const output = {
        url: () => ({ href: 'https://example.com/file.mp3' }),
      };
      expect(normalizeReplicateOutput(output)).toEqual(['https://example.com/file.mp3']);
    });

    it('filters out null and undefined from arrays', () => {
      const output = [
        'https://example.com/valid.mp3',
        null,
        undefined,
        { url: 'https://example.com/another.mp3' },
      ];
      expect(normalizeReplicateOutput(output)).toEqual([
        'https://example.com/valid.mp3',
        'https://example.com/another.mp3',
      ]);
    });
  });
});
