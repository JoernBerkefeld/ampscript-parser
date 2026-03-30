/**
 * AMPscript Parser
 *
 * Tokenizes and builds an AST from AMPscript code, which can be:
 * - AMPscript blocks: %%[ ... ]%%
 * - Script-tag blocks: <script runat="server" language="ampscript"> ... </script>
 * - Inline expressions: %%=...=%%
 * - HTML/text content between AMPscript segments
 *
 * The AST is a flat list of top-level nodes (Content, Block, InlineExpression).
 * Inside blocks, statements are parsed into their own node types.
 */

// ── Prettier Ignore Marking ───────────────────────────────────────────────

/**
 * Walks an array of statement nodes and marks nodes to be ignored based on
 * prettier-ignore and prettier-ignore-start / prettier-ignore-end comments.
 */
function markPrettierIgnore(nodes) {
    if (!Array.isArray(nodes)) return;
    let index = 0;
    while (index < nodes.length) {
        const node = nodes[index];
        if (
            node &&
            node.type === 'Comment' &&
            /^\s*\/\*\s*prettier-ignore\s*\*\/\s*$/i.test(node.value)
        ) {
            let index_ = index + 1;
            while (index_ < nodes.length && nodes[index_].type === 'Comment') index_++;
            if (index_ < nodes.length) nodes[index_].prettierIgnore = true;
            index = index_;
            continue;
        }
        if (node && node.type === 'Comment' && /prettier-ignore-start/i.test(node.value)) {
            let index_ = index + 1;
            while (
                index_ < nodes.length &&
                !(
                    nodes[index_].type === 'Comment' &&
                    /prettier-ignore-end/i.test(nodes[index_].value)
                )
            ) {
                if (nodes[index_].type !== 'Comment') nodes[index_].prettierIgnore = true;
                index_++;
            }
            index = index_ + 1;
            continue;
        }
        if (node && typeof node === 'object') {
            if (Array.isArray(node.statements)) markPrettierIgnore(node.statements);
            if (Array.isArray(node.consequent)) markPrettierIgnore(node.consequent);
            if (Array.isArray(node.alternates)) {
                for (const alt of node.alternates) {
                    if (Array.isArray(alt.body)) markPrettierIgnore(alt.body);
                }
            }
            if (Array.isArray(node.body)) markPrettierIgnore(node.body);
        }
        index++;
    }
}

// ── Token types ──────────────────────────────────────────────────────────────

const TokenType = {
    BLOCK_OPEN: 'BLOCK_OPEN',
    BLOCK_CLOSE: 'BLOCK_CLOSE',
    INLINE_OPEN: 'INLINE_OPEN',
    INLINE_CLOSE: 'INLINE_CLOSE',
    VAR: 'VAR',
    SET: 'SET',
    IF: 'IF',
    THEN: 'THEN',
    ELSEIF: 'ELSEIF',
    ELSE: 'ELSE',
    ENDIF: 'ENDIF',
    FOR: 'FOR',
    TO: 'TO',
    DOWNTO: 'DOWNTO',
    DO: 'DO',
    NEXT: 'NEXT',
    AND: 'AND',
    OR: 'OR',
    NOT: 'NOT',
    COMMA: 'COMMA',
    LPAREN: 'LPAREN',
    RPAREN: 'RPAREN',
    EQUALS: 'EQUALS',
    EQ: 'EQ',
    NEQ: 'NEQ',
    GT: 'GT',
    LT: 'LT',
    GTE: 'GTE',
    LTE: 'LTE',
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    BOOLEAN: 'BOOLEAN',
    IDENTIFIER: 'IDENTIFIER',
    VARIABLE: 'VARIABLE',
    COMMENT: 'COMMENT',
    NEWLINE: 'NEWLINE',
    WHITESPACE: 'WHITESPACE',
};

const KEYWORDS = {
    var: TokenType.VAR,
    set: TokenType.SET,
    if: TokenType.IF,
    then: TokenType.THEN,
    elseif: TokenType.ELSEIF,
    else: TokenType.ELSE,
    endif: TokenType.ENDIF,
    for: TokenType.FOR,
    to: TokenType.TO,
    downto: TokenType.DOWNTO,
    do: TokenType.DO,
    next: TokenType.NEXT,
    and: TokenType.AND,
    or: TokenType.OR,
    not: TokenType.NOT,
    true: TokenType.BOOLEAN,
    false: TokenType.BOOLEAN,
};

// ── Tokenizer ────────────────────────────────────────────────────────────────

function tokenizeBlock(code, offset = 0) {
    const tokens = [];
    let index = 0;

    while (index < code.length) {
        if (code[index] === ' ' || code[index] === '\t') {
            const start = index;
            while (index < code.length && (code[index] === ' ' || code[index] === '\t')) index++;
            tokens.push({
                type: TokenType.WHITESPACE,
                value: code.slice(start, index),
                start: offset + start,
                end: offset + index,
            });
            continue;
        }

        if (code[index] === '\n' || code[index] === '\r') {
            const start = index;
            if (code[index] === '\r' && code[index + 1] === '\n') index++;
            index++;
            tokens.push({
                type: TokenType.NEWLINE,
                value: code.slice(start, index),
                start: offset + start,
                end: offset + index,
            });
            continue;
        }

        if (code[index] === '/' && code[index + 1] === '*') {
            const start = index;
            index += 2;
            while (index < code.length && !(code[index] === '*' && code[index + 1] === '/'))
                index++;
            if (index < code.length) index += 2;
            tokens.push({
                type: TokenType.COMMENT,
                value: code.slice(start, index),
                start: offset + start,
                end: offset + index,
            });
            continue;
        }

        if (code[index] === '"' || code[index] === "'") {
            const quote = code[index];
            const start = index;
            index++;
            while (index < code.length && code[index] !== quote) {
                index++;
            }
            if (index < code.length) index++;
            tokens.push({
                type: TokenType.STRING,
                value: code.slice(start, index),
                start: offset + start,
                end: offset + index,
            });
            continue;
        }

        if (code[index] === '=' && code[index + 1] === '=') {
            tokens.push({
                type: TokenType.EQ,
                value: '==',
                start: offset + index,
                end: offset + index + 2,
            });
            index += 2;
            continue;
        }
        if (code[index] === '!' && code[index + 1] === '=') {
            tokens.push({
                type: TokenType.NEQ,
                value: '!=',
                start: offset + index,
                end: offset + index + 2,
            });
            index += 2;
            continue;
        }
        if (code[index] === '>' && code[index + 1] === '=') {
            tokens.push({
                type: TokenType.GTE,
                value: '>=',
                start: offset + index,
                end: offset + index + 2,
            });
            index += 2;
            continue;
        }
        if (code[index] === '<' && code[index + 1] === '=') {
            tokens.push({
                type: TokenType.LTE,
                value: '<=',
                start: offset + index,
                end: offset + index + 2,
            });
            index += 2;
            continue;
        }

        if (code[index] === '=') {
            tokens.push({
                type: TokenType.EQUALS,
                value: '=',
                start: offset + index,
                end: offset + index + 1,
            });
            index++;
            continue;
        }
        if (code[index] === '>') {
            tokens.push({
                type: TokenType.GT,
                value: '>',
                start: offset + index,
                end: offset + index + 1,
            });
            index++;
            continue;
        }
        if (code[index] === '<') {
            tokens.push({
                type: TokenType.LT,
                value: '<',
                start: offset + index,
                end: offset + index + 1,
            });
            index++;
            continue;
        }
        if (code[index] === '(') {
            tokens.push({
                type: TokenType.LPAREN,
                value: '(',
                start: offset + index,
                end: offset + index + 1,
            });
            index++;
            continue;
        }
        if (code[index] === ')') {
            tokens.push({
                type: TokenType.RPAREN,
                value: ')',
                start: offset + index,
                end: offset + index + 1,
            });
            index++;
            continue;
        }
        if (code[index] === ',') {
            tokens.push({
                type: TokenType.COMMA,
                value: ',',
                start: offset + index,
                end: offset + index + 1,
            });
            index++;
            continue;
        }

        if (code[index] === '@') {
            const start = index;
            index++;
            if (index < code.length && code[index] === '@') index++;
            while (index < code.length && /[a-zA-Z0-9_]/.test(code[index])) index++;
            tokens.push({
                type: TokenType.VARIABLE,
                value: code.slice(start, index),
                start: offset + start,
                end: offset + index,
            });
            continue;
        }

        if (
            /[0-9]/.test(code[index]) ||
            (code[index] === '-' && index + 1 < code.length && /[0-9]/.test(code[index + 1]))
        ) {
            const start = index;
            if (code[index] === '-') index++;
            while (index < code.length && /[0-9]/.test(code[index])) index++;
            if (index < code.length && code[index] === '.') {
                index++;
                while (index < code.length && /[0-9]/.test(code[index])) index++;
            }
            tokens.push({
                type: TokenType.NUMBER,
                value: code.slice(start, index),
                start: offset + start,
                end: offset + index,
            });
            continue;
        }

        if (/[a-zA-Z_]/.test(code[index])) {
            const start = index;
            while (index < code.length && /[a-zA-Z0-9_]/.test(code[index])) index++;
            const word = code.slice(start, index);
            const lower = word.toLowerCase();
            const kwType = KEYWORDS[lower];
            if (kwType) {
                tokens.push({
                    type: kwType,
                    value: word,
                    start: offset + start,
                    end: offset + index,
                });
            } else {
                tokens.push({
                    type: TokenType.IDENTIFIER,
                    value: word,
                    start: offset + start,
                    end: offset + index,
                });
            }
            continue;
        }

        const start = index;
        index++;
        tokens.push({
            type: 'RAW',
            value: code[start],
            start: offset + start,
            end: offset + index,
        });
    }

    return tokens;
}

// ── Statement Parser ─────────────────────────────────────────────────────────

function parseStatements(tokens) {
    const statements = [];
    let pos = 0;

    function _peek() {
        while (
            pos < tokens.length &&
            (tokens[pos].type === TokenType.WHITESPACE || tokens[pos].type === TokenType.NEWLINE)
        ) {
            pos++;
        }
        return pos < tokens.length ? tokens[pos] : null;
    }

    function current() {
        return pos < tokens.length ? tokens[pos] : null;
    }

    function advance() {
        return tokens[pos++];
    }

    function skipTrivia() {
        let newlineCount = 0;
        while (
            pos < tokens.length &&
            (tokens[pos].type === TokenType.WHITESPACE || tokens[pos].type === TokenType.NEWLINE)
        ) {
            if (tokens[pos].type === TokenType.NEWLINE) newlineCount++;
            pos++;
        }
        return newlineCount;
    }

    function parseExpression() {
        return parseOrExpr();
    }

    function parseOrExpr() {
        let left = parseAndExpr();
        while (pos < tokens.length) {
            skipTrivia();
            const t = current();
            if (t && t.type === TokenType.OR) {
                const opToken = advance();
                skipTrivia();
                const right = parseAndExpr();
                left = {
                    type: 'BinaryExpression',
                    operator: 'or',
                    originalOperator: opToken.value,
                    left,
                    right,
                    start: left.start,
                    end: right.end,
                };
            } else {
                break;
            }
        }
        return left;
    }

    function parseAndExpr() {
        let left = parseNotExpr();
        while (pos < tokens.length) {
            skipTrivia();
            const t = current();
            if (t && t.type === TokenType.AND) {
                const opToken = advance();
                skipTrivia();
                const right = parseNotExpr();
                left = {
                    type: 'BinaryExpression',
                    operator: 'and',
                    originalOperator: opToken.value,
                    left,
                    right,
                    start: left.start,
                    end: right.end,
                };
            } else {
                break;
            }
        }
        return left;
    }

    function parseNotExpr() {
        skipTrivia();
        const t = current();
        if (t && t.type === TokenType.NOT) {
            const start = t.start;
            const opToken = advance();
            skipTrivia();
            const expr = parseComparison();
            return {
                type: 'UnaryExpression',
                operator: 'not',
                originalOperator: opToken.value,
                argument: expr,
                start,
                end: expr.end,
            };
        }
        return parseComparison();
    }

    function parseComparison() {
        let left = parsePrimary();
        skipTrivia();
        const t = current();
        if (
            t &&
            (t.type === TokenType.EQ ||
                t.type === TokenType.NEQ ||
                t.type === TokenType.GT ||
                t.type === TokenType.LT ||
                t.type === TokenType.GTE ||
                t.type === TokenType.LTE)
        ) {
            const op = advance();
            skipTrivia();
            const right = parsePrimary();
            return {
                type: 'BinaryExpression',
                operator: op.value,
                left,
                right,
                start: left.start,
                end: right.end,
            };
        }
        return left;
    }

    function parsePrimary() {
        skipTrivia();
        const t = current();
        if (!t) {
            return { type: 'Empty', value: '', start: 0, end: 0 };
        }

        if (t.type === TokenType.LPAREN) {
            const start = t.start;
            advance();
            skipTrivia();
            const expr = parseExpression();
            skipTrivia();
            const closing = current();
            let end = expr.end;
            if (closing && closing.type === TokenType.RPAREN) {
                end = closing.end;
                advance();
            }
            return { type: 'ParenExpression', expression: expr, start, end };
        }

        if (t.type === TokenType.IDENTIFIER) {
            const savedPos = pos;
            const name = advance();
            skipTrivia();
            const next = current();
            if (next && next.type === TokenType.LPAREN) {
                advance();
                const arguments_ = [];
                skipTrivia();
                if (current() && current().type !== TokenType.RPAREN) {
                    arguments_.push(parseExpression());
                    while (current() && current().type === TokenType.COMMA) {
                        advance();
                        skipTrivia();
                        arguments_.push(parseExpression());
                    }
                }
                skipTrivia();
                let end = name.end;
                if (current() && current().type === TokenType.RPAREN) {
                    end = current().end;
                    advance();
                }
                return {
                    type: 'FunctionCall',
                    name: name.value,
                    arguments: arguments_,
                    start: name.start,
                    end,
                };
            }
            pos = savedPos;
            advance();
            return { type: 'Identifier', value: name.value, start: name.start, end: name.end };
        }

        if (t.type === TokenType.VARIABLE) {
            advance();
            return { type: 'Variable', value: t.value, start: t.start, end: t.end };
        }

        if (t.type === TokenType.STRING) {
            advance();
            const quote = t.value[0];
            const content = t.value.slice(1, -1);
            return { type: 'StringLiteral', value: content, quote, start: t.start, end: t.end };
        }

        if (t.type === TokenType.NUMBER) {
            advance();
            return { type: 'NumberLiteral', value: t.value, start: t.start, end: t.end };
        }

        if (t.type === TokenType.BOOLEAN) {
            advance();
            return {
                type: 'BooleanLiteral',
                value: t.value.toLowerCase(),
                originalValue: t.value,
                start: t.start,
                end: t.end,
            };
        }

        advance();
        return { type: 'Raw', value: t.value, start: t.start, end: t.end };
    }

    // ── Main statement parsing loop ──

    function pushStmt(stmt, blankLine) {
        if (blankLine) stmt.blankLineBefore = true;
        statements.push(stmt);
    }

    while (pos < tokens.length) {
        const newlines = skipTrivia();
        if (pos >= tokens.length) break;
        const hasBlankLine = newlines >= 2 && statements.length > 0;

        const t = current();

        if (t.type === TokenType.COMMENT) {
            advance();
            pushStmt({ type: 'Comment', value: t.value, start: t.start, end: t.end }, hasBlankLine);
            continue;
        }

        if (t.type === TokenType.VAR) {
            const start = t.start;
            const variableKeyword = t.value;
            advance();
            skipTrivia();
            const variables = [];
            while (current() && current().type === TokenType.VARIABLE) {
                variables.push({
                    type: 'Variable',
                    value: current().value,
                    start: current().start,
                    end: current().end,
                });
                advance();
                skipTrivia();
                if (current() && current().type === TokenType.COMMA) {
                    advance();
                    skipTrivia();
                }
            }
            pushStmt(
                {
                    type: 'VarDeclaration',
                    originalKeyword: variableKeyword,
                    variables,
                    start,
                    end: variables.length > 0 ? variables.at(-1).end : start + 3,
                },
                hasBlankLine,
            );
            continue;
        }

        if (t.type === TokenType.SET) {
            const start = t.start;
            const setKeyword = t.value;
            advance();
            skipTrivia();
            let target = null;
            if (current() && current().type === TokenType.VARIABLE) {
                target = {
                    type: 'Variable',
                    value: current().value,
                    start: current().start,
                    end: current().end,
                };
                advance();
            }
            skipTrivia();
            if (current() && current().type === TokenType.EQUALS) {
                advance();
            }
            skipTrivia();
            const value = parseExpression();
            pushStmt(
                {
                    type: 'SetStatement',
                    originalKeyword: setKeyword,
                    target,
                    value,
                    start,
                    end: value.end,
                },
                hasBlankLine,
            );
            continue;
        }

        if (t.type === TokenType.IF) {
            const stmt = parseIfStatement();
            pushStmt(stmt, hasBlankLine);
            continue;
        }

        if (t.type === TokenType.FOR) {
            const stmt = parseForStatement();
            pushStmt(stmt, hasBlankLine);
            continue;
        }

        if (t.type === TokenType.IDENTIFIER || t.type === TokenType.VARIABLE) {
            const expr = parseExpression();
            pushStmt(
                { type: 'ExpressionStatement', expression: expr, start: expr.start, end: expr.end },
                hasBlankLine,
            );
            continue;
        }

        if (
            t.type === TokenType.ENDIF ||
            t.type === TokenType.ELSE ||
            t.type === TokenType.ELSEIF ||
            t.type === TokenType.NEXT ||
            t.type === TokenType.THEN ||
            t.type === TokenType.DO
        ) {
            const kw = advance();
            if (t.type === TokenType.ELSEIF) {
                skipTrivia();
                if (current() && current().type !== TokenType.BLOCK_CLOSE) {
                    parseExpression();
                    skipTrivia();
                    if (current() && current().type === TokenType.THEN) advance();
                }
            }
            if (t.type === TokenType.NEXT) {
                skipTrivia();
                if (current() && current().type === TokenType.VARIABLE) advance();
            }
            pushStmt(
                {
                    type: 'RawStatement',
                    value: kw.value,
                    keyword: kw.value,
                    start: kw.start,
                    end: kw.end,
                },
                hasBlankLine,
            );
            continue;
        }

        advance();
    }

    function parseIfStatement() {
        const ifToken = current();
        const start = ifToken.start;
        advance();
        skipTrivia();
        const condition = parseExpression();
        skipTrivia();
        let thenKeyword = 'then';
        if (current() && current().type === TokenType.THEN) {
            thenKeyword = current().value;
            advance();
        }

        const originalKeywords = { if: ifToken.value, then: thenKeyword };
        const consequent = [];
        const alternates = [];
        let currentBlock = consequent;

        while (pos < tokens.length) {
            skipTrivia();
            if (pos >= tokens.length) break;

            const t = current();

            if (t.type === TokenType.ENDIF) {
                originalKeywords.endif = t.value;
                const endToken = advance();
                return {
                    type: 'IfStatement',
                    originalKeywords,
                    condition,
                    consequent,
                    alternates,
                    start,
                    end: endToken.end,
                };
            }

            if (t.type === TokenType.ELSEIF) {
                const elseifStart = t.start;
                const elseifKeyword = t.value;
                advance();
                skipTrivia();
                const elseifCondition = parseExpression();
                skipTrivia();
                let elseifThenKeyword = 'then';
                if (current() && current().type === TokenType.THEN) {
                    elseifThenKeyword = current().value;
                    advance();
                }
                currentBlock = [];
                alternates.push({
                    type: 'ElseIfClause',
                    originalKeywords: { elseif: elseifKeyword, then: elseifThenKeyword },
                    condition: elseifCondition,
                    body: currentBlock,
                    start: elseifStart,
                    end: elseifCondition.end,
                });
                continue;
            }

            if (t.type === TokenType.ELSE) {
                const elseStart = t.start;
                const elseKeyword = t.value;
                advance();
                currentBlock = [];
                alternates.push({
                    type: 'ElseClause',
                    originalKeywords: { else: elseKeyword },
                    body: currentBlock,
                    start: elseStart,
                    end: elseStart + 4,
                });
                continue;
            }

            const innerStatements = parseInnerStatement();
            if (innerStatements) {
                currentBlock.push(innerStatements);
            }
        }

        return {
            type: 'IfStatement',
            originalKeywords,
            condition,
            consequent,
            alternates,
            start,
            end: pos < tokens.length ? tokens[pos - 1].end : start,
        };
    }

    function parseForStatement() {
        const forToken = current();
        const start = forToken.start;
        const originalKeywords = { for: forToken.value };
        advance();
        skipTrivia();

        let counter = null;
        if (current() && current().type === TokenType.VARIABLE) {
            counter = {
                type: 'Variable',
                value: current().value,
                start: current().start,
                end: current().end,
            };
            advance();
        }
        skipTrivia();
        if (current() && current().type === TokenType.EQUALS) {
            advance();
        }
        skipTrivia();
        const startExpr = parseExpression();
        skipTrivia();

        let direction = 'to';
        if (current() && current().type === TokenType.DOWNTO) {
            direction = 'downto';
            originalKeywords.direction = current().value;
            advance();
        } else if (current() && current().type === TokenType.TO) {
            originalKeywords.direction = current().value;
            advance();
        }
        skipTrivia();
        const endExpr = parseExpression();
        skipTrivia();
        if (current() && current().type === TokenType.DO) {
            originalKeywords.do = current().value;
            advance();
        }

        const body = [];
        while (pos < tokens.length) {
            skipTrivia();
            if (pos >= tokens.length) break;

            const t = current();
            if (t.type === TokenType.NEXT) {
                originalKeywords.next = t.value;
                const nextToken = advance();
                skipTrivia();
                if (current() && current().type === TokenType.VARIABLE) {
                    advance();
                }
                return {
                    type: 'ForStatement',
                    originalKeywords,
                    counter,
                    startExpr,
                    endExpr,
                    direction,
                    body,
                    start,
                    end: nextToken.end,
                };
            }

            const stmt = parseInnerStatement();
            if (stmt) body.push(stmt);
        }

        return {
            type: 'ForStatement',
            originalKeywords,
            counter,
            startExpr,
            endExpr,
            direction,
            body,
            start,
            end: pos < tokens.length ? tokens[pos - 1].end : start,
        };
    }

    function parseInnerStatement() {
        skipTrivia();
        if (pos >= tokens.length) return null;

        const t = current();

        if (t.type === TokenType.COMMENT) {
            advance();
            return { type: 'Comment', value: t.value, start: t.start, end: t.end };
        }

        if (t.type === TokenType.VAR) {
            const start = t.start;
            const variableKeyword = t.value;
            advance();
            skipTrivia();
            const variables = [];
            while (current() && current().type === TokenType.VARIABLE) {
                variables.push({
                    type: 'Variable',
                    value: current().value,
                    start: current().start,
                    end: current().end,
                });
                advance();
                skipTrivia();
                if (current() && current().type === TokenType.COMMA) {
                    advance();
                    skipTrivia();
                }
            }
            return {
                type: 'VarDeclaration',
                originalKeyword: variableKeyword,
                variables,
                start,
                end: variables.length > 0 ? variables.at(-1).end : start + 3,
            };
        }

        if (t.type === TokenType.SET) {
            const start = t.start;
            const setKeyword = t.value;
            advance();
            skipTrivia();
            let target = null;
            if (current() && current().type === TokenType.VARIABLE) {
                target = {
                    type: 'Variable',
                    value: current().value,
                    start: current().start,
                    end: current().end,
                };
                advance();
            }
            skipTrivia();
            if (current() && current().type === TokenType.EQUALS) {
                advance();
            }
            skipTrivia();
            const value = parseExpression();
            return {
                type: 'SetStatement',
                originalKeyword: setKeyword,
                target,
                value,
                start,
                end: value.end,
            };
        }

        if (t.type === TokenType.IF) {
            return parseIfStatement();
        }

        if (t.type === TokenType.FOR) {
            return parseForStatement();
        }

        if (
            t.type === TokenType.IDENTIFIER ||
            t.type === TokenType.VARIABLE ||
            t.type === TokenType.LPAREN
        ) {
            const expr = parseExpression();
            return {
                type: 'ExpressionStatement',
                expression: expr,
                start: expr.start,
                end: expr.end,
            };
        }

        advance();
        return null;
    }

    return statements;
}

// ── Top-level parser ─────────────────────────────────────────────────────────

function parse(text) {
    const children = [];
    let index = 0;
    let contentStart = 0;

    function pushContent(end) {
        if (end > contentStart) {
            children.push({
                type: 'Content',
                value: text.slice(contentStart, end),
                start: contentStart,
                end,
            });
        }
    }

    const scriptOpenRe =
        /^<script\b(?=[^>]*\brunat\s*=\s*['"]server['"])(?=[^>]*\blanguage\s*=\s*['"]ampscript['"])[^>]*>/i;
    const scriptCloseRe = /^<\/script\s*>/i;

    while (index < text.length) {
        if (text[index] === '<') {
            const slice = text.slice(index);
            const openMatch = scriptOpenRe.exec(slice);
            if (openMatch) {
                pushContent(index);
                const blockStart = index;
                const openTag = openMatch[0];
                index += openTag.length;
                const codeStart = index;

                while (index < text.length) {
                    if (text[index] === '<') {
                        const closeMatch = scriptCloseRe.exec(text.slice(index));
                        if (closeMatch) break;
                    }
                    index++;
                }

                const codeEnd = index;
                const code = text.slice(codeStart, codeEnd);
                const closeMatch = scriptCloseRe.exec(text.slice(index));
                if (closeMatch) {
                    index += closeMatch[0].length;
                }

                const tokens = tokenizeBlock(code, codeStart);
                const stmts = parseStatements(tokens);
                markPrettierIgnore(stmts);

                children.push({
                    type: 'Block',
                    syntax: 'script-tag',
                    statements: stmts,
                    start: blockStart,
                    end: index,
                });
                contentStart = index;
                continue;
            }
        }

        if (text[index] === '%' && text[index + 1] === '%' && text[index + 2] === '[') {
            pushContent(index);
            const blockStart = index;
            index += 3;
            const codeStart = index;

            let depth = 1;
            while (index < text.length) {
                if (text[index] === '%' && text[index + 1] === '%' && text[index + 2] === '[') {
                    depth++;
                    index += 3;
                } else if (
                    text[index] === ']' &&
                    text[index + 1] === '%' &&
                    text[index + 2] === '%'
                ) {
                    depth--;
                    if (depth === 0) break;
                    index += 3;
                } else {
                    index++;
                }
            }

            const codeEnd = index;
            const code = text.slice(codeStart, codeEnd);
            index += 3;

            const tokens = tokenizeBlock(code, codeStart);
            const stmts = parseStatements(tokens);
            markPrettierIgnore(stmts);

            children.push({ type: 'Block', statements: stmts, start: blockStart, end: index });
            contentStart = index;
            continue;
        }

        if (text[index] === '%' && text[index + 1] === '%' && text[index + 2] === '=') {
            pushContent(index);
            const inlineStart = index;
            index += 3;
            const codeStart = index;

            while (index < text.length) {
                if (text[index] === '=' && text[index + 1] === '%' && text[index + 2] === '%') {
                    break;
                }
                index++;
            }

            const codeEnd = index;
            const code = text.slice(codeStart, codeEnd);
            index += 3;

            const tokens = tokenizeBlock(code, codeStart);
            const exprStatements = parseStatements(tokens);
            markPrettierIgnore(exprStatements);
            const expression = exprStatements.length > 0 ? exprStatements[0] : null;

            const expr =
                expression && expression.type === 'ExpressionStatement'
                    ? expression.expression
                    : expression;

            children.push({
                type: 'InlineExpression',
                expression: expr,
                start: inlineStart,
                end: index,
            });
            contentStart = index;
            continue;
        }

        index++;
    }

    pushContent(text.length);
    markPrettierIgnore(children);

    return { type: 'Document', children, start: 0, end: text.length };
}

export { parse, tokenizeBlock, parseStatements, TokenType };
