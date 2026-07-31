/**
 * Bracketed personalization strings such as `[_subscriberkey]` and `[First Name]`
 * parse into a single atomic PersonalizationString leaf node preserving the exact
 * inner text and source range.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { parse } from '../src/index.js';

/**
 * Returns the first Block in the parsed document.
 *
 * @param {string} src - AMPscript source to parse.
 * @returns {object} The first Block node.
 */
function firstBlock(src) {
    const doc = parse(src);
    return doc.children.find((c) => c.type === 'Block');
}

test('SET with a bracketed personalization string parses atomically', () => {
    const block = firstBlock('%%[ SET @x = [_subscriberkey] ]%%');
    assert.equal(block.statements.length, 1);
    const stmt = block.statements[0];
    assert.equal(stmt.type, 'SetStatement');
    assert.equal(stmt.value.type, 'PersonalizationString');
    assert.equal(stmt.value.value, '_subscriberkey');
});

test('bracketed personalization string with a space preserves inner text', () => {
    const block = firstBlock('%%[ SET @x = [First Name] ]%%');
    const stmt = block.statements[0];
    assert.equal(stmt.value.type, 'PersonalizationString');
    assert.equal(stmt.value.value, 'First Name');
    // Range should cover the whole [First Name] literal including brackets.
    const rendered = '%%[ SET @x = [First Name] ]%%'.slice(stmt.value.start, stmt.value.end);
    assert.equal(rendered, '[First Name]');
});

test('bracketed personalization string works as a function argument', () => {
    const block = firstBlock('%%[ SET @x = Uppercase([First Name]) ]%%');
    const stmt = block.statements[0];
    assert.equal(stmt.value.type, 'FunctionCall');
    assert.equal(stmt.value.arguments.length, 1);
    assert.equal(stmt.value.arguments[0].type, 'PersonalizationString');
    assert.equal(stmt.value.arguments[0].value, 'First Name');
});

test('bracketed personalization string works as a comparison operand', () => {
    const block = firstBlock('%%[ IF [_subscriberkey] == "abc" THEN SET @x = 1 ENDIF ]%%');
    const stmt = block.statements[0];
    assert.equal(stmt.type, 'IfStatement');
    assert.equal(stmt.condition.type, 'BinaryExpression');
    assert.equal(stmt.condition.left.type, 'PersonalizationString');
    assert.equal(stmt.condition.left.value, '_subscriberkey');
});

test('inline %%=[...]=%% expression parses a PersonalizationString', () => {
    const doc = parse('%%=[First Name]=%%');
    const inline = doc.children.find((c) => c.type === 'InlineExpression');
    assert.ok(inline, 'expected an InlineExpression');
    assert.equal(inline.expression.type, 'PersonalizationString');
    assert.equal(inline.expression.value, 'First Name');
});

test('unterminated bracket does not consume unrelated statements', () => {
    const block = firstBlock('%%[ SET @x = [First Name\nSET @y = 1 ]%%');
    // The malformed bracket must not swallow the second SET.
    const setStatements = block.statements.filter((s) => s.type === 'SetStatement');
    assert.ok(
        setStatements.some((s) => s.target && s.target.value === '@y'),
        'the second SET should still be parsed',
    );
});
