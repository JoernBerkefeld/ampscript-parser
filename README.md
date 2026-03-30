# ampscript-parser

AMPscript lexer and parser that produces an AST for Salesforce Marketing Cloud (SFMC) tooling.

Handles all AMPscript embedding syntaxes:

- Block syntax: `%%[ ... ]%%`
- Script-tag syntax: `<script runat="server" language="ampscript"> ... </script>`
- Inline expressions: `%%=...=%%`
- Plain HTML/text content between AMPscript segments

This package is used internally by:

- [prettier-plugin-sfmc](https://www.npmjs.com/package/prettier-plugin-sfmc) — AMPscript formatting
- [eslint-plugin-sfmc](https://www.npmjs.com/package/eslint-plugin-sfmc) — AMPscript linting

## Installation

```sh
npm install ampscript-parser
```

## Usage

```js
import { parse, tokenizeBlock, parseStatements, TokenType } from 'ampscript-parser';
```

### `parse(text)`

Parses a full document string (HTML with embedded AMPscript) into a `Document` AST. This is the main entry point for most use cases.

```js
import { parse } from 'ampscript-parser';

const doc = parse(`
<p>Hello %%=AttributeValue('firstname')=%%</p>
%%[
  SET @greeting = "Welcome"
  IF @greeting == "Welcome" THEN
    Output(@greeting)
  ENDIF
]%%
`);

// doc.type === 'Document'
// doc.children — array of Content, Block, and InlineExpression nodes
for (const node of doc.children) {
    console.log(node.type); // 'Content' | 'Block' | 'InlineExpression'
}
```

#### AST node types

| Node type | Description |
|---|---|
| `Document` | Root node; has a `children` array |
| `Content` | Plain HTML/text segment between AMPscript regions |
| `Block` | A `%%[ ]%%` or script-tag block; has a `statements` array |
| `InlineExpression` | A `%%=...=%%` expression; has an `expression` property |

### `tokenizeBlock(code, offset?)`

Tokenizes a raw AMPscript code string (the content inside a block or inline expression, without the surrounding delimiters). Returns an array of token objects.

```js
import { tokenizeBlock } from 'ampscript-parser';

const tokens = tokenizeBlock("SET @name = 'World'");

for (const token of tokens) {
    console.log(token.type);  // e.g. 'SET', 'VARIABLE', 'EQUALS', 'STRING'
    console.log(token.value); // raw text of the token
    console.log(token.start); // character offset in the source
    console.log(token.end);   // end offset
}
```

The optional `offset` parameter shifts all token positions by a base character offset, useful when the code snippet originates from a larger document.

### `parseStatements(tokens)`

Parses an array of tokens (as returned by `tokenizeBlock`) into an array of statement AST nodes. Useful when you already have tokens and want to build the AST incrementally.

```js
import { tokenizeBlock, parseStatements } from 'ampscript-parser';

const tokens = tokenizeBlock("VAR @x\nSET @x = Add(1, 2)");
const statements = parseStatements(tokens);

for (const stmt of statements) {
    console.log(stmt.type); // e.g. 'VarStatement', 'SetStatement'
}
```

### `TokenType`

An object of token type constants used to identify tokens returned by `tokenizeBlock`.

```js
import { TokenType } from 'ampscript-parser';

console.log(TokenType.SET);        // 'SET'
console.log(TokenType.IF);         // 'IF'
console.log(TokenType.VARIABLE);   // 'VARIABLE'
console.log(TokenType.STRING);     // 'STRING'
console.log(TokenType.NUMBER);     // 'NUMBER'
console.log(TokenType.BOOLEAN);    // 'BOOLEAN'
console.log(TokenType.IDENTIFIER); // 'IDENTIFIER'
console.log(TokenType.COMMENT);    // 'COMMENT'
```

Full list of token types: `BLOCK_OPEN`, `BLOCK_CLOSE`, `INLINE_OPEN`, `INLINE_CLOSE`, `VAR`, `SET`, `IF`, `THEN`, `ELSEIF`, `ELSE`, `ENDIF`, `FOR`, `TO`, `DOWNTO`, `DO`, `NEXT`, `AND`, `OR`, `NOT`, `COMMA`, `LPAREN`, `RPAREN`, `EQUALS`, `EQ`, `NEQ`, `GT`, `LT`, `GTE`, `LTE`, `STRING`, `NUMBER`, `BOOLEAN`, `IDENTIFIER`, `VARIABLE`, `COMMENT`, `NEWLINE`, `WHITESPACE`.

## License

MIT
