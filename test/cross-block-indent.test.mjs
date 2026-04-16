/**
 * Cross-block IF/FOR: RawStatement closers get crossBlockIndentDepth from linkCrossBlockStatements.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { parse } from '../src/index.js';

test('parse annotates endif and next RawStatements when split across blocks', () => {
    const src = `%%[
    for @i = 1 to @rowCount do
        if not Empty(@val) then
]%%
<li>%%=v(@val)=%%</li>
%%[
    endif
    next @i
]%%`;

    const doc = parse(src);
    assert.equal(doc.type, 'Document');
    const blocks = doc.children.filter((c) => c.type === 'Block');
    assert.ok(blocks.length >= 2, 'expected at least two AMPscript blocks');

    const second = blocks[1];
    const stmts = second.statements;
    assert.equal(stmts.length, 2);
    assert.equal(stmts[0].type, 'RawStatement');
    assert.equal(stmts[1].type, 'RawStatement');
    assert.equal(String(stmts[0].value).toLowerCase(), 'endif');
    assert.equal(String(stmts[1].value).toLowerCase().startsWith('next'), true);

    assert.equal(stmts[0].crossBlockIndentDepth, 1);
    assert.equal(stmts[1].crossBlockIndentDepth, 0);
});

test('single-block if does not set crossBlockIndentDepth on RawStatement', () => {
    const src = `%%[
    if @a then
        set @b = 1
    endif
]%%`;
    const doc = parse(src);
    const block = doc.children.find((c) => c.type === 'Block');
    const ifStmt = block.statements[0];
    assert.equal(ifStmt.type, 'IfStatement');
    assert.ok('endif' in (ifStmt.originalKeywords || {}));
});
