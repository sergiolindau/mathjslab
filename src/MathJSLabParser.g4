parser grammar MathJSLabParser;

options { tokenVocab = MathJSLabLexer; }

@header {

import * as AST from './AST';

/**
 * ## References
 * * [MATLAB Operator Precedence](https://www.mathworks.com/help/matlab/matlab_prog/operator-precedence.html)
 * * [Octave lexer](https://github.com/gnu-octave/octave/blob/default/libinterp/parse-tree/lex.ll)
 * * [Octave parser](https://github.com/gnu-octave/octave/blob/default/libinterp/parse-tree/oct-parse.yy)
 * * [An ANTLR4 grammar for MATLAB files.](https://github.com/antlr/grammars-v4/tree/master/matlab)
 * * [mparser](https://www.mathworks.com/matlabcentral/fileexchange/32769-mparser)
 */

}

/**
 * Input (start non-terminal symbol).
 */

input returns [node: AST.NodeInput]
    : sep? EOF {
        localctx.node = null;
    }
    | sep? global_list EOF {
        localctx.node = localctx.global_list().node;
    }
    ;

/**
 * Statements and statement lists.
 */

global_list returns [node: AST.NodeInput]
    locals [i: number = 0]
    : statement {
        localctx.statement(localctx.i).node.start = {
            line: localctx.statement(localctx.i).start.line,
            column: localctx.statement(localctx.i).start.column
        };
        localctx.statement(localctx.i).node.stop = {
            line: this._input.LT(1).column > 0 ? this._input.LT(1).line : this._input.LT(1).line - 1,
            column: this._input.LT(1).column > 0 ? this._input.LT(1).column - 1 : Infinity,
        };
        localctx.node = AST.nodeListFirst(localctx.statement(localctx.i++).node);
    } (sep statement {
        localctx.statement(localctx.i).node.start = {
            line: localctx.statement(localctx.i).start.line,
            column: localctx.statement(localctx.i).start.column
        };
        localctx.statement(localctx.i).node.stop = {
            line: this._input.LT(1).column > 0 ? this._input.LT(1).line : this._input.LT(1).line - 1,
            column: this._input.LT(1).column > 0 ? this._input.LT(1).column - 1 : Infinity,
        };
        if (localctx.sep(localctx.i - 1).getText()[0] === ';') {
            localctx.node.list[localctx.node.list.length - 1].omitOut = true;
        }
        localctx.node = AST.appendNodeList(localctx.node, localctx.statement(localctx.i++).node);
    } )* sep? {
        if (localctx.sep(localctx.i - 1) && localctx.sep(localctx.i - 1).getText()[0] === ';') {
            localctx.node.list[localctx.node.list.length - 1].omitOut = true;
        }
    }
    ;

list returns [node: AST.NodeInput]
    locals [i: number = 0]
    : statement {
        localctx.node = AST.nodeListFirst(localctx.statement(localctx.i++).node);
    } (sep statement {
        if (localctx.sep(localctx.i - 1).getText()[0] === ';') {
            localctx.node.list[localctx.node.list.length - 1].omitOut = true;
        }
        localctx.node = AST.appendNodeList(localctx.node, localctx.statement(localctx.i++).node);
    } )* sep? {
        if (localctx.sep(localctx.i - 1) && localctx.sep(localctx.i - 1).getText()[0] === ';') {
            localctx.node.list[localctx.node.list.length - 1].omitOut = true;
        }
    }
    ;

statement returns [node: AST.NodeInput]
    : expression {
        localctx.node = localctx.expression().node;
    }
    | command {
        localctx.node = localctx.command().node;
    }
    | word_list_cmd {
        localctx.node = localctx.word_list_cmd().node;
    }
    ;

/**
 * Word-list command
 * These are not really like expressions since they can't appear on
 * the RHS of an assignment. But they are also not like commands (IF,
 * WHILE, etc.
 */

word_list_cmd returns [node: AST.NodeInput]
    locals [i: number = 0]
    : identifier (string {
        if (localctx.i === 0) {
            localctx.node = AST.nodeListFirst(localctx.string_(localctx.i++).node);
        } else {
            AST.appendNodeList(localctx.node, localctx.string_(localctx.i++).node);
        }
    } )* {
        localctx.node = AST.nodeCmdWList(localctx.identifier().node, localctx.node);
    }
    ;

/**
 * Expressions
 */

identifier returns [node: AST.NodeInput]
    : IDENTIFIER {
        localctx.node = AST.nodeIdentifier(localctx.IDENTIFIER().getText());
    }
    ;

string returns [node: AST.NodeInput]
    : STRING {
        const str = localctx.STRING().getText();
        localctx.node = AST.nodeString(str.substring(1, str.length - 1), str.at(0));
    }
    | UNQUOTED_STRING {
        localctx.node = AST.nodeString(localctx.UNQUOTED_STRING().getText());
    }
    ;

number returns [node: AST.NodeInput]
    : DECIMAL_NUMBER {
        localctx.node = AST.nodeNumber(localctx.DECIMAL_NUMBER().getText());
    }
    ;

end_range returns [node: AST.NodeInput]
    : ENDRANGE {
        localctx.node = AST.nodeLiteral('ENDRANGE');
    }
    ;

constant returns [node: AST.NodeInput]
    : number {
        localctx.node = localctx.number_().node;
    }
    | string {
        localctx.node = localctx.string_().node
    }
    | end_range {
        localctx.node = localctx.end_range().node;
    }
    ;

matrix returns [node: AST.NodeInput]
    locals [i: number = 0]
    : LBRACKET RBRACKET {
        localctx.node = AST.emptyArray();
    }
    | LBRACKET matrix_row {
        localctx.node = AST.nodeFirstRow(localctx.matrix_row(localctx.i++).node);
    } ( (SEMICOLON | nl) matrix_row {
        localctx.node = AST.nodeAppendRow(localctx.node, localctx.matrix_row(localctx.i++).node);
    } )* nl? RBRACKET
    | LCURLYBR RCURLYBR {
        localctx.node = AST.emptyArray(true);
    }
    | LCURLYBR matrix_row {
        localctx.node = AST.nodeFirstRow(localctx.matrix_row(localctx.i++).node, true);
    } ( (SEMICOLON | nl) matrix_row {
        localctx.node = AST.nodeAppendRow(localctx.node, localctx.matrix_row(localctx.i++).node);
    } )* nl? RCURLYBR
    ;

matrix_row returns [node: AST.NodeInput]
    locals [i: number = 0]
    : (COMMA | WSPACE) {
        localctx.node = null;
    }
    | (COMMA | WSPACE)? list_element {
        localctx.node = AST.nodeListFirst(localctx.list_element(localctx.i++).node);
    } ( (COMMA | WSPACE) list_element {
        localctx.node = AST.appendNodeList(localctx.node, localctx.list_element(localctx.i++).node);
    } )* (COMMA | WSPACE)?
    ;

primary_expr returns [node: AST.NodeInput]
    : identifier {
        localctx.node = localctx.identifier().node;
    }
    | constant {
        localctx.node = localctx.constant().node;
    }
    | matrix {
        localctx.node = localctx.matrix().node;
    }
    | LPAREN expression RPAREN {
        localctx.node = AST.nodeOp('()', localctx.expression().node);
    }
    ;

magic_colon returns [node: AST.NodeInput]
    : COLON {
        localctx.node = AST.nodeLiteral(':');
    }
    ;

magic_tilde returns [node: AST.NodeInput]
    : TILDE {
        localctx.node = AST.nodeLiteral('<~>');
    }
    ;

list_element returns [node: AST.NodeInput]
    : expression {
        localctx.node = localctx.expression().node;
    }
    | magic_colon {
        localctx.node = localctx.magic_colon().node;
    }
    | magic_tilde {
        localctx.node = localctx.magic_tilde().node;
    }
    ;

arg_list returns [node: AST.NodeInput]
    locals [i: number = 0]
    : list_element {
        localctx.node = AST.nodeListFirst(localctx.list_element(localctx.i++).node);
    } ( COMMA list_element {
        localctx.node = AST.appendNodeList(localctx.node, localctx.list_element(localctx.i++).node);
    } )*
    ;

oper_expr returns [node: AST.NodeInput]
    : primary_expr {
        localctx.node = localctx.primary_expr().node;
    }
    | oper_expr op = (PLUS_PLUS | MINUS_MINUS) {
        localctx.node = AST.nodeOp('_' + localctx._op.text as AST.TOperator, localctx.oper_expr(0).node);
    }
    | oper_expr LPAREN RPAREN {
        localctx.node = AST.nodeArgExpr(localctx.oper_expr(0).node);
    }
    | oper_expr LPAREN arg_list RPAREN {
        localctx.node = AST.nodeArgExpr(localctx.oper_expr(0).node, localctx.arg_list().node);
    }
    | oper_expr op = (TRANSPOSE | HERMITIAN) {
        localctx.node = AST.nodeOp(localctx._op.text as AST.TOperator, localctx.oper_expr(0).node);
    }
    | <assoc=right> oper_expr op = (POW | EPOW) power_expr {
        localctx.node = AST.nodeOp(localctx._op.text as AST.TOperator, localctx.oper_expr(0).node, localctx.power_expr().node);
    }
    | op = (PLUS | MINUS) oper_expr {
        localctx.node = AST.nodeOp(localctx._op.text + '_' as AST.TOperator, localctx.oper_expr(0).node);
    }
    | op = (TILDE | EXCLAMATION) oper_expr {
        localctx.node = AST.nodeOp(localctx._op.text as AST.TOperator, localctx.oper_expr(0).node);
    }
    | oper_expr op = (MUL | DIV | LEFTDIV | EMUL | EDIV | ELEFTDIV) oper_expr {
        localctx.node = AST.nodeOp(localctx._op.text as AST.TOperator, localctx.oper_expr(0).node, localctx.oper_expr(1).node);
    }
    | oper_expr op = (PLUS | MINUS) oper_expr {
        localctx.node = AST.nodeOp(localctx._op.text as AST.TOperator, localctx.oper_expr(0).node, localctx.oper_expr(1).node);
    }
    ;

power_expr returns [node: AST.NodeInput]
    : primary_expr {
        localctx.node = localctx.primary_expr().node;
    }
    | power_expr op = (PLUS_PLUS | MINUS_MINUS) {
        localctx.node = AST.nodeOp('_' + localctx._op.text as AST.TOperator, localctx.power_expr().node);
    }
    | power_expr LPAREN RPAREN {
        localctx.node = AST.nodeArgExpr(localctx.power_expr().node);
    }
    | power_expr LPAREN arg_list RPAREN {
        localctx.node = AST.nodeArgExpr(localctx.power_expr().node, localctx.arg_list().node);
    }
    | op = (PLUS_PLUS | MINUS_MINUS) power_expr {
        localctx.node = AST.nodeOp(localctx._op.text + '_' as AST.TOperator, localctx.power_expr().node);
    }
    | op = (PLUS | MINUS | TILDE | EXCLAMATION) power_expr {
        localctx.node = AST.nodeOp(localctx._op.text + '_' as AST.TOperator, localctx.power_expr().node);
    }
    ;

colon_expr returns [node: AST.NodeInput]
    : oper_expr COLON oper_expr {
        localctx.node = AST.nodeRange(localctx.oper_expr(0).node, localctx.oper_expr(1).node);
    }
    | oper_expr COLON oper_expr COLON oper_expr {
        localctx.node = AST.nodeRange(localctx.oper_expr(0).node, localctx.oper_expr(1).node, localctx.oper_expr(2).node);
    }
    ;

simple_expr returns [node: AST.NodeInput]
    : oper_expr {
        localctx.node = localctx.oper_expr().node;
    }
    | colon_expr {
        localctx.node = localctx.colon_expr().node;
    }
    | simple_expr op = (EXPR_LT | EXPR_LE | EXPR_GT | EXPR_GE | EXPR_EQ | EXPR_NE) simple_expr {
        localctx.node = AST.nodeOp(localctx._op.text as AST.TOperator, localctx.simple_expr(0).node, localctx.simple_expr(1).node);
    }
    | simple_expr op = EXPR_AND simple_expr {
        localctx.node = AST.nodeOp(localctx._op.text as AST.TOperator, localctx.simple_expr(0).node, localctx.simple_expr(1).node);
    }
    | simple_expr op = EXPR_OR simple_expr {
        localctx.node = AST.nodeOp(localctx._op.text as AST.TOperator, localctx.simple_expr(0).node, localctx.simple_expr(1).node);
    }
    | simple_expr op = EXPR_AND_AND simple_expr {
        localctx.node = AST.nodeOp(localctx._op.text as AST.TOperator, localctx.simple_expr(0).node, localctx.simple_expr(1).node);
    }
    | simple_expr op = EXPR_OR_OR simple_expr {
        localctx.node = AST.nodeOp(localctx._op.text as AST.TOperator, localctx.simple_expr(0).node, localctx.simple_expr(1).node);
    }
    ;

expression returns [node: AST.NodeInput]
    : simple_expr {
        localctx.node = localctx.simple_expr().node;
    }
    | simple_expr op = (EQ | ADD_EQ | SUB_EQ | MUL_EQ | EMUL_EQ | DIV_EQ | EDIV_EQ | LEFTDIV_EQ | ELEFTDIV_EQ | POW_EQ | EPOW_EQ | AND_EQ | OR_EQ) expression {
        localctx.node = AST.nodeOp(localctx._op.text as AST.TOperator, localctx.simple_expr().node, localctx.expression().node);
    }
    ;

/**
 * Commands, declarations, and function definitions.
 */

command returns [node: AST.NodeInput]
    : select_command {
        localctx.node = localctx.select_command().node;
    }
    ;

/**
 * Selection statements.
 */

select_command returns [node: AST.NodeInput]
    : if_command {
        localctx.node = localctx.if_command().node;
    }
    ;

/**
 * If statement.
 */

if_command returns [node: AST.NodeInput]
    locals [i: number = 0]
    : IF expression sep? list? {
        localctx.node = AST.nodeIfBegin(localctx.expression().node, localctx.list() ? localctx.list().node : AST.nodeListFirst());
    } (elseif_clause {
        localctx.node = AST.nodeIfAppendElseIf(localctx.node, localctx.elseif_clause(localctx.i++).node);
    })* else_clause? {
        if (localctx.else_clause()) {
            localctx.node = AST.nodeIfAppendElse(localctx.node, localctx.else_clause().node);
        }
    } (END | ENDIF)
    ;

elseif_clause returns [node: AST.NodeInput]
    : ELSEIF sep? expression sep? list? {
        localctx.node = AST.nodeElseIf(localctx.expression().node, localctx.list() ? localctx.list().node : AST.nodeListFirst());
    }
    ;

else_clause returns [node: AST.NodeInput]
    : ELSE sep? list? {
        localctx.node = AST.nodeElse(localctx.list() ? localctx.list().node : AST.nodeListFirst());
    }
    ;

/**
 * Separators and others.
 */

sep_no_nl
    : (COMMA | SEMICOLON)+
    ;

nl
    : NEWLINE+
    ;

sep
    : (COMMA | SEMICOLON | NEWLINE)+
    ;
