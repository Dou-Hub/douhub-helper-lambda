
const supertest = require('supertest');
const { isNonEmptyString, assignDeep } = require('../build/index');

describe('isNonEmptyString', () => {
    it('good string', async () => {
        expect(isNonEmptyString('aaa')).toBe(true);
    });

    it('empty string', async () => {
        expect(isNonEmptyString('')).toBe(false);
    });

    it('number', async () => {
        expect(isNonEmptyString(1)).toBe(false);
        expect(isNonEmptyString(1.0)).toBe(false);
        expect(isNonEmptyString(NaN)).toBe(false);
    });

    it('other types', async () => {
        expect(isNonEmptyString({ a: 1 })).toBe(false);
        expect(isNonEmptyString(null)).toBe(false);
        expect(isNonEmptyString(undefined)).toBe(false);
        expect(isNonEmptyString([1])).toBe(false);
    });
})

describe('assignDeep', () => {
    it('test', async () => {
        const a = { r: { a: 1, c:1 } };
        const b = { r: { a: 2, b: 1 } };
        const result = assignDeep(a, b);
        delete result.r.c;
        expect(
            JSON.stringify(result) == JSON.stringify({ r: { a: 2, b: 1 } } ) && 
            JSON.stringify(a) == JSON.stringify({ r: { a: 1, c:1 } })
        ).toBe(true);
    });
})

