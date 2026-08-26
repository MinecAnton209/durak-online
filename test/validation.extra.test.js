import { describe, it, expect } from 'vitest';
import { escapeHtml, validateRouletteBet } from '../utils/validation';

describe('escapeHtml', () => {
    it('escapes ampersand', () => expect(escapeHtml('a & b')).toBe('a &amp; b'));
    it('escapes angle brackets', () => expect(escapeHtml('<script>')).toBe('&lt;script&gt;'));
    it('escapes double quotes', () => expect(escapeHtml('"hi"')).toBe('&quot;hi&quot;'));
    it('escapes single quote', () => expect(escapeHtml("'hi'")).toBe('&#x27;hi&#x27;'));
    it('escapes forward slash', () => expect(escapeHtml('a/b')).toBe('a&#x2F;b'));
    it('escapes a full XSS payload', () => {
        const xss = '<img src=x onerror=alert(1)>';
        expect(escapeHtml(xss)).toBe('&lt;img src=x onerror=alert(1)&gt;');
    });
    it('returns empty string for non-string input', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
        expect(escapeHtml(123)).toBe('');
    });
    it('leaves safe text unchanged', () => {
        expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
    });
    it('escapes attribute-breaking payloads', () => {
        expect(escapeHtml('"><script>')).toBe('&quot;&gt;&lt;script&gt;');
    });
});

describe('validateRouletteBet: number', () => {
    it('accepts a valid number bet', () => {
        const r = validateRouletteBet({ amount: 100, type: 'number', value: 17 });
        expect(r.valid).toBe(true);
    });
    it('rejects number below 0', () => {
        expect(validateRouletteBet({ amount: 100, type: 'number', value: -1 }).valid).toBe(false);
    });
    it('rejects number above 36', () => {
        expect(validateRouletteBet({ amount: 100, type: 'number', value: 37 }).valid).toBe(false);
    });
    it('accepts boundary numbers 0 and 36', () => {
        expect(validateRouletteBet({ amount: 100, type: 'number', value: 0 }).valid).toBe(true);
        expect(validateRouletteBet({ amount: 100, type: 'number', value: 36 }).valid).toBe(true);
    });
    it('rejects non-numeric string value', () => {
        expect(validateRouletteBet({ amount: 100, type: 'number', value: 'abc' }).valid).toBe(false);
    });
});

describe('validateRouletteBet: color', () => {
    it('accepts red', () => {
        expect(validateRouletteBet({ amount: 50, type: 'color', value: 'red' }).valid).toBe(true);
    });
    it('accepts black', () => {
        expect(validateRouletteBet({ amount: 50, type: 'color', value: 'black' }).valid).toBe(true);
    });
    it('rejects invalid color', () => {
        expect(validateRouletteBet({ amount: 50, type: 'color', value: 'green' }).valid).toBe(false);
    });
});

describe('validateRouletteBet: even-odd', () => {
    it('accepts even', () => {
        expect(validateRouletteBet({ amount: 50, type: 'even-odd', value: 'even' }).valid).toBe(true);
    });
    it('accepts odd', () => {
        expect(validateRouletteBet({ amount: 50, type: 'even-odd', value: 'odd' }).valid).toBe(true);
    });
    it('rejects invalid parity', () => {
        expect(validateRouletteBet({ amount: 50, type: 'even-odd', value: 'neither' }).valid).toBe(false);
    });
});

describe('validateRouletteBet: envelopes', () => {
    it('rejects amount below 1', () => {
        expect(validateRouletteBet({ amount: 0, type: 'color', value: 'red' }).valid).toBe(false);
    });
    it('rejects amount above 10000', () => {
        expect(validateRouletteBet({ amount: 10001, type: 'color', value: 'red' }).valid).toBe(false);
    });
    it('rejects non-object', () => {
        expect(validateRouletteBet(null).valid).toBe(false);
        expect(validateRouletteBet('bet').valid).toBe(false);
    });
    it('rejects unknown type', () => {
        expect(validateRouletteBet({ amount: 50, type: 'column', value: 2 }).valid).toBe(false);
    });
});
