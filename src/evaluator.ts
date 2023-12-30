/**
 * MATLAB®/Octave like syntax parser/interpreter/compiler.
 */

import { CharStreams, CommonTokenStream, DiagnosticErrorListener, PredictionMode } from 'antlr4';
import MathJSLabLexer from './MathJSLabLexer';
import MathJSLabParser from './MathJSLabParser';
import LexerErrorListener from './LexerErrorListener';
import ParserErrorListener from './ParserErrorListener';
import * as AST from './AST';

import { substSymbol } from './substSymbol';
import { CharString } from './CharString';
import { ComplexDecimal } from './ComplexDecimal';
import { MultiArray } from './MultiArray';
import { CoreFunctions } from './CoreFunctions';
import { LinearAlgebra } from './LinearAlgebra';
import { MathObject, MathOperationType, UnaryMathOperation, BinaryMathOperation, MathOperation } from './MathOperation';
import { Configuration } from './Configuration';
import { Structure } from './Structure';

/**
 * aliasNameTable type.
 */
export type TAliasNameTable = Record<string, RegExp>;

/**
 * baseFunctionTable type.
 */
export type TBaseFunctionTableEntry = {
    mapper: boolean;
    ev: boolean[];
    func: Function;
    unparserMathML?: (tree: AST.NodeInput) => string;
};
export type TBaseFunctionTable = Record<string, TBaseFunctionTableEntry>;

/**
 * nameTable type.
 */
export type TNameTableEntry = {
    parameter: AST.NodeIdentifier[];
    expression: AST.NodeExpr;
};
export type TNameTable = Record<string, TNameTableEntry>;

/**
 * commandWordListTable type.
 */
export type TCommandWordListFunction = (...args: string[]) => any;
export type TCommandWordListTableEntry = {
    func: TCommandWordListFunction;
};
export type TCommandWordListTable = Record<string, TCommandWordListTableEntry>;

/**
 * TEvaluatorConfig type.
 */
export type TEvaluatorConfig = {
    aliasTable?: TAliasNameTable;
    externalFunctionTable?: TBaseFunctionTable;
    externalCmdWListTable?: TCommandWordListTable;
};

export type IncDecOperator = (tree: AST.NodeIdentifier) => MathObject;

/**
 * Evaluator object.
 */
export class Evaluator {
    /**
     * After run Evaluate method, the exitStatus property will contains
     * exit state of method.
     */
    public response = {
        EXTERNAL: -2,
        WARNING: -1,
        OK: 0,
        LEX_ERROR: 1,
        PARSER_ERROR: 2,
        EVAL_ERROR: 3,
    };

    /**
     * Debug flag.
     */
    public debug: boolean = false;

    /**
     * Native name table. It's inserted in nameTable when Evaluator constructor executed.
     */
    private readonly nativeNameTable: Record<string, ComplexDecimal> = {
        false: ComplexDecimal.false(),
        true: ComplexDecimal.true(),
        i: ComplexDecimal.onei(),
        I: ComplexDecimal.onei(),
        j: ComplexDecimal.onei(),
        J: ComplexDecimal.onei(),
        e: ComplexDecimal.e(),
        pi: ComplexDecimal.pi(),
        inf: ComplexDecimal.inf_0(),
        Inf: ComplexDecimal.inf_0(),
        nan: ComplexDecimal.NaN_0(),
        NaN: ComplexDecimal.NaN_0(),
    };

    public readonly nativeNameTableList = Object.keys(this.nativeNameTable);

    /**
     * Name table.
     */
    public nameTable: TNameTable = {};

    /**
     * Alias table.
     */
    private aliasTable: TAliasNameTable;

    /**
     * Base function table.
     */
    public baseFunctionTable: TBaseFunctionTable = {};

    /**
     * Get a list of names of defined functions in baseFunctionTable.
     */
    public get baseFunctionList(): string[] {
        return Object.keys(this.baseFunctionTable);
    }

    /**
     * Local table.
     */
    public localTable: Record<string, AST.NodeInput> = {};

    /**
     * Command word list table.
     */
    public commandWordListTable: TCommandWordListTable = {
        clear: {
            func: (...args: string[]): void => this.Clear(...args),
        },
        /* Debug purpose commands */
        __operators__: {
            /* eslint-disable-next-line  @typescript-eslint/no-unused-vars */
            func: (...args: string[]): MultiArray => {
                const operators = Object.keys(this.opTable).sort();
                const result = new MultiArray([operators.length, 1], null, true);
                result.array = operators.map((operator) => [new CharString(operator)]);
                return result;
            },
        },
        __keywords__: {
            /* eslint-disable-next-line  @typescript-eslint/no-unused-vars */
            func: (...args: string[]): MultiArray => {
                const keywords = MathJSLabLexer.keywordNames.slice(1).sort() as string[];
                const result = new MultiArray([keywords.length, 1], null, true);
                result.array = keywords.map((keyword) => [new CharString(keyword)]);
                return result;
            },
        },
        __builtins__: {
            /* eslint-disable-next-line  @typescript-eslint/no-unused-vars */
            func: (...args: string[]): MultiArray => {
                return MultiArray.emptyArray(true);
            },
        },
        __list_functions__: {
            /* eslint-disable-next-line  @typescript-eslint/no-unused-vars */
            func: (...args: string[]): MultiArray => {
                return MultiArray.emptyArray(true);
            },
        },
        local_functions: {
            /* eslint-disable-next-line  @typescript-eslint/no-unused-vars */
            func: (...args: string[]): MultiArray => {
                return MultiArray.emptyArray(true);
            },
        },
        __dump_symtab_info__: {
            /* eslint-disable-next-line  @typescript-eslint/no-unused-vars */
            func: (...args: string[]): MultiArray => {
                return MultiArray.emptyArray(true);
            },
        },
    };

    /**
     * Evaluator exit status.
     */
    public exitStatus: number;

    /**
     * Increment and decrement operator
     * @param pre `true` if prefixed. `false` if postfixed.
     * @param operation Operation (`'plus'` or `'minus'`).
     * @returns Operator function with signature `(tree: AST.NodeIdentifier) => MathObject`.
     */
    private incDecOp(pre: boolean, operation: 'plus' | 'minus'): IncDecOperator {
        if (pre) {
            return (tree: AST.NodeIdentifier): MathObject => {
                if (tree.type === 'IDENT') {
                    if (this.nameTable[tree.id].expression) {
                        this.nameTable[tree.id].expression = MathOperation[operation](this.nameTable[tree.id].expression, ComplexDecimal.one());
                        return this.nameTable[tree.id].expression;
                    } else {
                        throw new EvalError('in x++ or ++x, x must be defined first.');
                    }
                } else {
                    throw new SyntaxError(`invalid ${operation === 'plus' ? 'increment' : 'decrement'} variable.`);
                }
            };
        } else {
            return (tree: AST.NodeIdentifier): MathObject => {
                if (tree.type === 'IDENT') {
                    if (this.nameTable[tree.id].expression) {
                        const value = MathOperation.copy(this.nameTable[tree.id].expression);
                        this.nameTable[tree.id].expression = MathOperation[operation](this.nameTable[tree.id].expression, ComplexDecimal.one());
                        return value;
                    } else {
                        throw new EvalError('in x++ or ++x, x must be defined first.');
                    }
                } else {
                    throw new SyntaxError(`invalid ${operation === 'plus' ? 'increment' : 'decrement'} variable.`);
                }
            };
        }
    }

    /**
     * Operator table.
     */
    private readonly opTable: Record<string, MathOperationType | IncDecOperator> = {
        '+': MathOperation.plus,
        '-': MathOperation.minus,
        '.*': MathOperation.times,
        '*': MathOperation.mtimes,
        './': MathOperation.rdivide,
        '/': MathOperation.mrdivide,
        '.\\': MathOperation.ldivide,
        '\\': MathOperation.mldivide,
        '.^': MathOperation.power,
        '^': MathOperation.mpower,
        '+_': MathOperation.uplus,
        '-_': MathOperation.uminus,
        ".'": MathOperation.transpose,
        "'": MathOperation.ctranspose,
        '<': MathOperation.lt,
        '<=': MathOperation.le,
        '==': MathOperation.eq,
        '>=': MathOperation.ge,
        '>': MathOperation.gt,
        '!=': MathOperation.ne,
        '&': MathOperation.and,
        '|': MathOperation.or,
        '!': MathOperation.not,
        '&&': MathOperation.mand,
        '||': MathOperation.mor,
        '++_': this.incDecOp(true, 'plus'),
        '--_': this.incDecOp(true, 'minus'),
        '_++': this.incDecOp(false, 'plus'),
        '_--': this.incDecOp(false, 'minus'),
    };

    /**
     * User functions.
     */
    private readonly functions: Record<string, Function> = {
        unparse: (tree: AST.NodeInput): CharString => new CharString(this.Unparse(tree)),
    };

    /**
     * Local methods.
     */
    public readonly unparseString = CharString.unparse;
    public readonly unparseStringMathML = CharString.unparseMathML;
    public readonly newNumber = ComplexDecimal.newThis;
    public readonly unparseNumber = ComplexDecimal.unparse;
    public readonly unparseNumberMathML = ComplexDecimal.unparseMathML;
    public readonly isRowVector = MultiArray.isRowVector;
    public readonly unparseArray = MultiArray.unparse;
    public readonly unparseStructure = Structure.unparse;
    public readonly unparseStructureMathML = Structure.unparseMathML;
    public readonly unparseArrayMathML = MultiArray.unparseMathML;
    public readonly evaluateArray = MultiArray.evaluate;
    public readonly mapArray = MultiArray.rawMap;
    public readonly getElements = MultiArray.getElements;
    public readonly getElementsLogical = MultiArray.getElementsLogical;
    public readonly setElements = MultiArray.setElements;
    public readonly setElementsLogical = MultiArray.setElementsLogical;
    public readonly expandRange = MultiArray.expandRange;
    public readonly array0x0 = MultiArray.emptyArray;
    public readonly linearize = MultiArray.linearize;
    public readonly scalarToArray = MultiArray.scalarToMultiArray;
    public readonly linearLength = MultiArray.linearLength;
    public readonly getDimension = MultiArray.getDimension;
    public readonly toLogical = MultiArray.toLogical;
    public readonly getField = Structure.getField;
    public readonly setNewField = Structure.setNewField;

    /**
     * Special functions MathML unparser.
     */
    private readonly unparseMathMLFunctions: Record<string, (tree: AST.NodeIndexExpr) => string> = {
        abs: (tree: AST.NodeIndexExpr): string => `<mrow><mo>|</mo>${this.unparserMathML(tree.args[0])}<mo>|</mo></mrow>`,
        conj: (tree: AST.NodeIndexExpr): string => `<mover><mrow>${this.unparserMathML(tree.args[0])}</mrow><mo>&OverBar;</mo></mover>`,
        sqrt: (tree: AST.NodeIndexExpr): string => `<msqrt><mrow>${this.unparserMathML(tree.args[0])}</mrow></msqrt>`,
        root: (tree: AST.NodeIndexExpr): string => `<mroot><mrow>${this.unparserMathML(tree.args[0])}</mrow><mrow>${this.unparserMathML(tree.args[1])}</mrow></mroot>`,
        exp: (tree: AST.NodeIndexExpr): string => `<msup><mi>e</mi><mrow>${this.unparserMathML(tree.args[0])}</mrow></msup>`,
        logb: (tree: AST.NodeIndexExpr): string => `<msub><mi>log</mi><mrow>${this.unparserMathML(tree.args[0])}</mrow></msub><mrow>${this.unparserMathML(tree.args[1])}</mrow>`,
        log2: (tree: AST.NodeIndexExpr): string => `<msub><mi>log</mi><mrow><mn>2</mn></mrow></msub><mrow>${this.unparserMathML(tree.args[0])}</mrow>`,
        log10: (tree: AST.NodeIndexExpr): string => `<msub><mi>log</mi><mrow><mn>10</mn></mrow></msub><mrow>${this.unparserMathML(tree.args[0])}</mrow>`,
        gamma: (tree: AST.NodeIndexExpr): string => `<mi>&Gamma;</mi><mrow><mo>(</mo>${this.unparserMathML(tree.args[0])}<mo>)</mo></mrow>`,
        factorial: (tree: AST.NodeIndexExpr): string => `<mrow><mo>(</mo>${this.unparserMathML(tree.args[0])}<mo>)</mo></mrow><mo>!</mo>`,
    };

    /**
     * Alias name function. This property is set at Evaluator instantiation.
     * @param name Alias name.
     * @returns Canonical name.
     */
    public aliasName: (name: string) => string = (name: string): string => name;

    /**
     * Evaluator object constructor
     */
    constructor(config?: TEvaluatorConfig) {
        this.exitStatus = this.response.OK;
        /* Set opTable aliases */
        this.opTable['**'] = this.opTable['^'];
        this.opTable['.**'] = this.opTable['.^'];
        this.opTable['~='] = this.opTable['!='];
        this.opTable['~'] = this.opTable['!'];
        /* Load nativeNameTable */
        this.loadNativeTable();
        /* Define Evaluator functions */
        for (const func in this.functions) {
            this.defineFunction(func, this.functions[func]);
        }
        /* Define function operators */
        for (const func in MathOperation.leftAssociativeMultipleOperations) {
            this.defineLeftAssociativeMultipleOperationFunction(func, MathOperation.leftAssociativeMultipleOperations[func]);
        }
        for (const func in MathOperation.binaryOperations) {
            this.defineBinaryOperatorFunction(func, MathOperation.binaryOperations[func]);
        }
        for (const func in MathOperation.unaryOperations) {
            this.defineUnaryOperatorFunction(func, MathOperation.unaryOperations[func]);
        }
        /* Define function mappers */
        for (const func in ComplexDecimal.mapFunction) {
            this.defineFunction(func, ComplexDecimal.mapFunction[func], true);
        }
        /* Define other functions */
        for (const func in ComplexDecimal.twoArgFunction) {
            this.defineFunction(func, ComplexDecimal.twoArgFunction[func]);
        }
        /* Define Configuration functions */
        for (const func in Configuration.functions) {
            this.defineFunction(func, Configuration.functions[func]);
        }
        /* Define CoreFunctions functions */
        for (const func in CoreFunctions.functions) {
            this.defineFunction(func, CoreFunctions.functions[func]);
        }
        /* Define LinearAlgebra functions */
        for (const func in LinearAlgebra.functions) {
            this.defineFunction(func, LinearAlgebra.functions[func]);
        }
        /* Load unparserMathML for special functions */
        for (const func in this.unparseMathMLFunctions) {
            this.baseFunctionTable[func].unparserMathML = this.unparseMathMLFunctions[func];
        }
        if (config) {
            if (config.aliasTable) {
                this.aliasTable = config.aliasTable;
                this.aliasName = (name: string): string => {
                    let result = false;
                    let aliasname = '';
                    for (const i in this.aliasTable) {
                        if (this.aliasTable[i].test(name)) {
                            result = true;
                            aliasname = i;
                            break;
                        }
                    }
                    if (result) {
                        return aliasname;
                    } else {
                        return name;
                    }
                };
            } else {
                this.aliasName = (name: string): string => name;
            }
            if (config.externalFunctionTable) {
                Object.assign(this.baseFunctionTable, config.externalFunctionTable);
            }
            if (config.externalCmdWListTable) {
                Object.assign(this.commandWordListTable, config.externalCmdWListTable);
            }
        } else {
            this.aliasName = (name: string): string => name;
        }
    }

    /**
     * Parse input string.
     * @param input String to parse.
     * @returns Abstract syntax tree of input.
     */
    public Parse(input: string): AST.NodeInput {
        // Give the lexer the input as a stream of characters.
        const inputStream = CharStreams.fromString(input);
        const lexer = new MathJSLabLexer(inputStream);

        // Set word-list commands in lexer.
        lexer.commandNames = Object.keys(this.commandWordListTable);

        // Create a stream of tokens and give it to the parser. Set parser to construct a parse tree.
        const tokenStream = new CommonTokenStream(lexer);
        const parser = new MathJSLabParser(tokenStream);
        parser.buildParseTrees = true;

        // Remove error listeners and add LexerErrorListener and ParserErrorListener.
        lexer.removeErrorListeners();
        lexer.addErrorListener(new LexerErrorListener());
        parser.removeErrorListeners();
        parser.addErrorListener(new ParserErrorListener());
        if (this.debug) {
            // Add DiagnosticErrorListener to parser to notify when the parser
            // detects an ambiguity. Set prediction mode to report all ambiguities.
            // parser.addErrorListener(new DiagnosticErrorListener());
            // parser._interp.predictionMode = PredictionMode.LL_EXACT_AMBIG_DETECTION;
        }

        // Parse input and return AST.
        return parser.input().node;
    }

    /**
     * Load native name table in name table.
     */
    private loadNativeTable(): void {
        /* Insert nativeNameTable in nameTable */
        for (const name in this.nativeNameTable) {
            this.nameTable[name] = { parameter: [], expression: this.nativeNameTable[name] };
        }
    }

    /**
     * Restart evaluator.
     */
    public Restart(): void {
        this.nameTable = {};
        this.localTable = {};
        this.loadNativeTable();
    }

    /**
     * Clear variables. If names is 0 lenght restart evaluator.
     * @param names Variable names to clear in nameTable and baseFunctionTable.
     */
    public Clear(...names: string[]): void {
        if (names.length === 0) {
            this.Restart();
        } else {
            names.forEach((name) => {
                delete this.nameTable[name];
                delete this.baseFunctionTable[name];
                if (this.nativeNameTableList.includes(name)) {
                    this.nameTable[name] = {
                        expression: this.nativeNameTable[name],
                        parameter: [],
                    };
                }
            });
        }
    }

    /**
     * Throws error if left hand side length of multiple assignment greater
     * than maximum length (to be used in ReturnSelector functions).
     * @param maxLength Maximum length of return list.
     * @param currentLength Requested length of return list.
     */
    public static throwErrorIfGreaterThanReturnList(maxLength: number, currentLength: number): void {
        if (currentLength > maxLength) {
            throw new EvalError(`element number ${maxLength + 1} undefined in return list`);
        }
    }

    /**
     * Tests if it is a NodeReturnList and if so reduces it to its first
     * element.
     * @param value A node.
     * @returns Reduced node if `tree` is a NodeReturnList.
     */
    public reduceIfReturnList(tree: AST.NodeInput): AST.NodeInput {
        if (tree.type === 'RETLIST') {
            const result = tree.selector(1, 0);
            result.parent = tree.parent;
            return result;
        } else {
            return tree;
        }
    }

    /**
     * Validate left side of assignment node.
     * @param tree Left side of assignment node.
     * @param shallow True if tree is a left root of assignment.
     * @returns An object with four properties: `left`, `id`, `args` and `field`.
     */
    public validateAssignment(tree: AST.NodeExpr, shallow: boolean, local: boolean, fname: string): { id: string; index: AST.NodeExpr[]; field: string[] }[] {
        const invalidLeftAssignmentMessage = 'invalid left side of assignment';
        if (tree.type === 'IDENT') {
            return [
                {
                    id: tree.id,
                    index: [],
                    field: [],
                },
            ];
        } else if (tree.type === 'IDX' && tree.expr.type === 'IDENT') {
            return [
                {
                    id: tree.expr.id,
                    index: tree.args,
                    field: [],
                },
            ];
        } else if (tree.type === '.') {
            const field = tree.field.map((field: AST.NodeExpr) => {
                if (typeof field === 'string') {
                    return field;
                } else {
                    const result = this.reduceIfReturnList(this.Evaluator(field, local, fname));
                    if (result instanceof CharString) {
                        return result.str;
                    } else {
                        throw new EvalError(`${invalidLeftAssignmentMessage}: dynamic structure field names must be strings.`);
                    }
                }
            });
            if (tree.obj.type === 'IDENT') {
                return [
                    {
                        id: tree.obj.id,
                        index: [],
                        field,
                    },
                ];
            } else if (tree.obj.type === 'IDX' && tree.obj.expr.type === 'IDENT') {
                return [
                    {
                        id: tree.obj.expr.id,
                        index: tree.obj.args,
                        field,
                    },
                ];
            } else {
                throw new EvalError(`${invalidLeftAssignmentMessage}.`);
            }
        } else if (tree.type === '<~>') {
            return [
                {
                    id: '~',
                    index: [],
                    field: [],
                },
            ];
        } else if (shallow && this.isRowVector(tree)) {
            return tree.array[0].map((left: AST.NodeExpr) => this.validateAssignment(left, false, local, fname)[0]);
        } else {
            throw new EvalError(`${invalidLeftAssignmentMessage}.`);
        }
    }

    /**
     * Define function in baseFunctionTable.
     * @param name Name of function.
     * @param func Function body.
     * @param map `true` if function is a mapper function.
     * @param ev A `boolean` array indicating which function argument should
     * be evaluated before executing the function.
     */
    private defineFunction(name: string, func: Function, mapper: boolean = false, ev: boolean[] = []): void {
        this.baseFunctionTable[name] = { mapper, ev, func };
    }

    /**
     * Define unary operator function in baseFunctionTable.
     * @param name Name of function.
     * @param func Function body.
     */
    private defineUnaryOperatorFunction(name: string, func: UnaryMathOperation): void {
        this.baseFunctionTable[name] = {
            mapper: false,
            ev: [],
            func: (...operand: AST.NodeExpr) => {
                if (operand.length === 1) {
                    return func(operand[0]);
                } else {
                    throw new EvalError(`Invalid call to ${name}. Type 'help ${name}' to see correct usage.`);
                }
            },
        };
    }

    /**
     * Define binary operator function in baseFunctionTable.
     * @param name Name of function.
     * @param func Function body.
     */
    private defineBinaryOperatorFunction(name: string, func: BinaryMathOperation): void {
        this.baseFunctionTable[name] = {
            mapper: false,
            ev: [],
            func: (left: AST.NodeExpr, ...right: AST.NodeExpr) => {
                if (right.length === 1) {
                    return func(left, right[0]);
                } else {
                    throw new EvalError(`Invalid call to ${name}. Type 'help ${name}' to see correct usage.`);
                }
            },
        };
    }

    /**
     * Define define two-or-more operand function in baseFunctionTable.
     * @param name
     * @param func
     */
    private defineLeftAssociativeMultipleOperationFunction(name: string, func: BinaryMathOperation): void {
        this.baseFunctionTable[name] = {
            mapper: false,
            ev: [],
            func: (left: AST.NodeExpr, ...right: AST.NodeExpr) => {
                if (right.length === 1) {
                    return func(left, right[0]);
                } else if (right.length > 1) {
                    let result = func(left, right[0]);
                    for (let i = 1; i < right.length; i++) {
                        result = func(result, right[i]);
                    }
                    return result;
                } else {
                    throw new EvalError(`Invalid call to ${name}. Type 'help ${name}' to see correct usage.`);
                }
            },
        };
    }

    /**
     *
     * @param tree
     * @returns
     */
    public toBoolean(tree: AST.NodeExpr): boolean {
        const value = tree instanceof MultiArray ? this.toLogical(tree) : tree;
        if (value instanceof ComplexDecimal) {
            return Boolean(value.re.toNumber() || value.im.toNumber());
        } else {
            return !!value.str;
        }
    }

    /**
     * Expression tree recursive evaluator.
     * @param tree Expression to evaluate.
     * @param local Set `true` if evaluating function.
     * @param fname Function name if evaluating function.
     * @returns Expression `tree` evaluated.
     */
    public Evaluator(tree: AST.NodeInput, local: boolean = false, fname: string = ''): AST.NodeInput {
        if (this.debug) {
            console.log(
                `Evaluator(\ntree:${JSON.stringify(
                    tree,
                    (key: string, value: AST.NodeInput) => (key !== 'parent' ? value : value === null ? 'root' : true),
                    2,
                )},\nlocal:${local},\nfname:${fname});`,
            );
        }
        if (tree) {
            if (tree instanceof ComplexDecimal || tree instanceof CharString || tree instanceof Structure) {
                /* NUMBER, STRING or STRUCTURE */
                return tree;
            } else if (tree instanceof MultiArray) {
                /* MATRIX */
                return this.evaluateArray(tree, this, local, fname);
            } else {
                switch (tree.type) {
                    case '+':
                    case '-':
                    case '.*':
                    case '*':
                    case './':
                    case '/':
                    case '.\\':
                    case '\\':
                    case '.^':
                    case '^':
                    case '.**':
                    case '**':
                    case '<':
                    case '<=':
                    case '==':
                    case '>=':
                    case '>':
                    case '!=':
                    case '~=':
                    case '&':
                    case '|':
                    case '&&':
                    case '||':
                        tree.left.parent = tree;
                        tree.right.parent = tree;
                        return (this.opTable[tree.type] as BinaryMathOperation)(
                            this.reduceIfReturnList(this.Evaluator(tree.left, local, fname)),
                            this.reduceIfReturnList(this.Evaluator(tree.right, local, fname)),
                        );
                    case '()':
                        tree.right.parent = tree;
                        return this.reduceIfReturnList(this.Evaluator(tree.right, local, fname));
                    case '!':
                    case '~':
                    case '+_':
                    case '-_':
                        tree.right.parent = tree;
                        return (this.opTable[tree.type] as UnaryMathOperation)(this.reduceIfReturnList(this.Evaluator(tree.right, local, fname)));
                    case '++_':
                    case '--_':
                        tree.right.parent = tree;
                        return (this.opTable[tree.type] as IncDecOperator)(tree.right);
                    case ".'":
                    case "'":
                        tree.left.parent = tree;
                        return (this.opTable[tree.type] as UnaryMathOperation)(this.reduceIfReturnList(this.Evaluator(tree.left, local, fname)));
                    case '_++':
                    case '_--':
                        tree.left.parent = tree;
                        return (this.opTable[tree.type] as IncDecOperator)(tree.left);
                    case '=':
                    case '+=':
                    case '-=':
                    case '*=':
                    case '/=':
                    case '\\=':
                    case '^=':
                    case '**=':
                    case '.*=':
                    case './=':
                    case '.\\=':
                    case '.^=':
                    case '.**=':
                    case '&=':
                    case '|=':
                        tree.left.parent = tree;
                        tree.right.parent = tree;
                        const assignment = this.validateAssignment(tree.left, true, local, fname);
                        const op: AST.TOperator | '' = tree.type.substring(0, tree.type.length - 1);
                        if (assignment.length > 1 && op.length > 0) {
                            throw new EvalError('computed multiple assignment not allowed.');
                        }
                        let right: AST.NodeExpr;
                        try {
                            right = this.Evaluator(tree.right, false, fname);
                        } catch {
                            right = tree.right;
                        }
                        if (right.type !== 'RETLIST') {
                            right = AST.nodeReturnList((length: number, index: number) => {
                                if (index === 0) {
                                    return tree.right;
                                } else {
                                    throw new EvalError(`element number ${index + 1} undefined in return list`);
                                }
                            });
                        }
                        const resultList = AST.nodeListFirst();
                        for (let n = 0; n < assignment.length; n++) {
                            const { id, index, field } = assignment[n];
                            if (id !== '~') {
                                if (index.length === 0) {
                                    /* Name definition. */
                                    if (right.type !== 'RETLIST') {
                                        right = this.Evaluator(right, false, fname);
                                    }
                                    const rightN = right.selector(assignment.length, n);
                                    rightN.parent = tree.right;
                                    const expr = op.length ? AST.nodeOp(op as AST.TOperator, AST.nodeIdentifier(id), rightN) : rightN;
                                    try {
                                        if (field.length > 0) {
                                            if (typeof this.nameTable[id] === 'undefined') {
                                                this.nameTable[id] = { parameter: [], expression: new Structure({}) };
                                            }
                                            if (this.nameTable[id].expression instanceof Structure) {
                                                this.setNewField(this.nameTable[id].expression, field, this.reduceIfReturnList(this.Evaluator(expr)));
                                            } else {
                                                throw new EvalError('in indexed assignment.');
                                            }
                                            AST.appendNodeList(resultList, AST.nodeOp('=', AST.nodeIdentifier(id), this.nameTable[id].expression));
                                        } else {
                                            this.nameTable[id] = { parameter: [], expression: this.reduceIfReturnList(this.Evaluator(expr)) };
                                            AST.appendNodeList(resultList, AST.nodeOp('=', AST.nodeIdentifier(id), this.nameTable[id].expression));
                                        }
                                        continue;
                                    } catch (error) {
                                        this.nameTable[id] = { parameter: [], expression: expr };
                                        throw error;
                                    }
                                } else {
                                    /* Function definition or indexed matrix reference. */
                                    if (op) {
                                        if (typeof this.nameTable[id] !== 'undefined') {
                                            if (this.nameTable[id].parameter.length === 0) {
                                                /* Indexed matrix reference on left hand side with operator. */
                                                if (index.length === 1) {
                                                    /* Test logical indexing. */
                                                    const arg0 = this.reduceIfReturnList(this.Evaluator(index[0], local, fname));
                                                    if (arg0 instanceof MultiArray && arg0.type === ComplexDecimal.LOGICAL) {
                                                        /* Logical indexing. */
                                                        this.setElementsLogical(
                                                            this.nameTable,
                                                            id,
                                                            field,
                                                            this.linearize(arg0) as ComplexDecimal[],
                                                            this.scalarToArray(
                                                                this.reduceIfReturnList(
                                                                    this.Evaluator(
                                                                        AST.nodeOp(
                                                                            op,
                                                                            this.getElementsLogical(this.nameTable[id].expression, id, field, arg0),
                                                                            this.scalarToArray(this.reduceIfReturnList(this.Evaluator(right.selector(assignment.length, n)))),
                                                                        ),
                                                                        false,
                                                                        fname,
                                                                    ),
                                                                ),
                                                            ),
                                                        );
                                                    } else {
                                                        /* Not logical indexing. */
                                                        this.setElements(
                                                            this.nameTable,
                                                            id,
                                                            field,
                                                            [arg0],
                                                            this.scalarToArray(
                                                                this.reduceIfReturnList(
                                                                    this.Evaluator(
                                                                        AST.nodeOp(
                                                                            op,
                                                                            this.getElements(this.nameTable[id].expression, id, field, [arg0]),
                                                                            this.scalarToArray(this.reduceIfReturnList(this.Evaluator(right.selector(assignment.length, n)))),
                                                                        ),
                                                                        false,
                                                                        fname,
                                                                    ),
                                                                ),
                                                            ),
                                                        );
                                                    }
                                                } else {
                                                    this.setElements(
                                                        this.nameTable,
                                                        id,
                                                        field,
                                                        index.map((arg: AST.NodeExpr) => this.reduceIfReturnList(this.Evaluator(arg))),
                                                        this.scalarToArray(
                                                            this.reduceIfReturnList(
                                                                this.Evaluator(
                                                                    AST.nodeOp(
                                                                        op,
                                                                        this.getElements(this.nameTable[id].expression, id, field, index),
                                                                        this.scalarToArray(this.reduceIfReturnList(this.Evaluator(right.selector(assignment.length, n)))),
                                                                    ),
                                                                    false,
                                                                    fname,
                                                                ),
                                                            ),
                                                        ),
                                                    );
                                                }
                                                AST.appendNodeList(resultList, AST.nodeOp('=', AST.nodeIdentifier(id), this.nameTable[id].expression));
                                                continue;
                                            } else {
                                                throw new EvalError(`can't perform indexed assignment for function handle type.`);
                                            }
                                        } else {
                                            throw new EvalError(`in computed assignment ${id}(index) OP= X, ${id} must be defined first.`);
                                        }
                                    } else {
                                        /* Test if is a function definition (test if index is a list of undefined NAME). */
                                        let isFunction: boolean = true;
                                        for (let i = 0; i < index.length; i++) {
                                            isFunction &&= index[i].type === 'IDENT';
                                            if (isFunction) {
                                                isFunction &&= typeof this.nameTable[index[i].id] === 'undefined';
                                            }
                                            if (!isFunction) {
                                                break;
                                            }
                                        }
                                        if (isFunction) {
                                            this.nameTable[id] = { parameter: index, expression: right.selector(assignment.length, n) };
                                            AST.appendNodeList(resultList, tree);
                                            continue;
                                        } else {
                                            /* Indexed matrix reference on left hand side. */
                                            if (index.length === 1) {
                                                /* Test logical indexing. */
                                                index[0].parent = tree.left;
                                                index[0].index = 0;
                                                const arg0 = this.reduceIfReturnList(this.Evaluator(index[0], local, fname));
                                                if (arg0 instanceof MultiArray && arg0.type === ComplexDecimal.LOGICAL) {
                                                    /* Logical indexing. */
                                                    this.setElementsLogical(
                                                        this.nameTable,
                                                        id,
                                                        field,
                                                        this.linearize(arg0) as ComplexDecimal[],
                                                        this.scalarToArray(this.reduceIfReturnList(this.Evaluator(right.selector(assignment.length, n)))),
                                                    );
                                                } else {
                                                    /* Not logical indexing. */
                                                    this.setElements(
                                                        this.nameTable,
                                                        id,
                                                        field,
                                                        [arg0],
                                                        this.scalarToArray(this.reduceIfReturnList(this.Evaluator(right.selector(assignment.length, n)))),
                                                    );
                                                }
                                            } else {
                                                this.setElements(
                                                    this.nameTable,
                                                    id,
                                                    field,
                                                    index.map((arg: AST.NodeExpr, i: number) => {
                                                        arg.parent = tree.left;
                                                        arg.index = i;
                                                        return this.reduceIfReturnList(this.Evaluator(arg));
                                                    }),
                                                    this.scalarToArray(this.reduceIfReturnList(this.Evaluator(right.selector(assignment.length, n)))),
                                                );
                                            }
                                            AST.appendNodeList(resultList, AST.nodeOp('=', AST.nodeIdentifier(id), this.nameTable[id].expression));
                                            continue;
                                        }
                                    }
                                }
                            }
                        }
                        if (tree.parent === null || tree.parent.parent === null) {
                            /* assignment at root expression */
                            if (resultList.list.length === 1) {
                                /* single assignment */
                                return resultList.list[0];
                            } else {
                                /* multiple assignment */
                                return resultList;
                            }
                        } else {
                            /* assignment at right side */
                            return (resultList.list[0] as AST.NodeExpr).right;
                        }
                    case 'IDENT':
                        if (local && this.localTable[fname] && this.localTable[fname][tree.id]) {
                            /* Defined in localTable. */
                            this.localTable[fname][tree.id].parent = tree;
                            return this.localTable[fname][tree.id];
                        } else if (tree.id in this.nameTable) {
                            /* Defined in nameTable. */
                            if (this.nameTable[tree.id].parameter.length === 0) {
                                /* Defined as name. */
                                this.nameTable[tree.id].expression.parent = tree;
                                return this.reduceIfReturnList(this.Evaluator(this.nameTable[tree.id].expression));
                            } else {
                                /* Defined as function name. */
                                throw new EvalError(`calling ${tree.id} function without arguments list.`);
                            }
                        } else {
                            throw new ReferenceError(`'${tree.id}' undefined.`);
                        }
                    case '.':
                        return this.getField(
                            this.reduceIfReturnList(this.Evaluator(tree.obj, local, fname)),
                            tree.field.map((field: AST.NodeExpr) => {
                                if (typeof field === 'string') {
                                    return field;
                                } else {
                                    const result = this.reduceIfReturnList(this.Evaluator(field, local, fname));
                                    if (result instanceof CharString) {
                                        return result.str;
                                    } else {
                                        throw new EvalError(`Dynamic structure field names must be strings.`);
                                    }
                                }
                            }),
                        );
                    case 'LIST':
                        const result = {
                            type: 'LIST',
                            list: new Array(tree.list.length),
                            parent: tree.parent === null ? null : tree,
                        };
                        for (let i = 0; i < tree.list.length; i++) {
                            /* Convert undefined name, defined in word-list command, to word-list command.
                             * (Null length word-list command) */
                            if (
                                tree.list[i].type === 'IDENT' &&
                                !(local && this.localTable[fname] && this.localTable[fname][tree.list[i].id]) &&
                                !(tree.list[i].id in this.nameTable) &&
                                Object.keys(this.commandWordListTable).indexOf(tree.list[i].id) >= 0
                            ) {
                                tree.list[i].type = 'CMDWLIST';
                                tree.list[i].omitAns = true;
                                tree.list[i]['args'] = [];
                            }
                            tree.list[i].parent = result;
                            tree.list[i].index = i;
                            result.list[i] = this.reduceIfReturnList(this.Evaluator(tree.list[i], local, fname));
                            if (tree.parent === null && !tree.list[i].omitAns) {
                                this.nameTable['ans'] = { parameter: [], expression: result.list[i] };
                            }
                        }
                        return result;
                    case 'RANGE':
                        tree.start_.parent = tree;
                        tree.stop_.parent = tree;
                        if (tree.stride_) {
                            tree.stride_.parent = tree;
                        }
                        return this.expandRange(
                            this.reduceIfReturnList(this.Evaluator(tree.start_, local, fname)),
                            this.reduceIfReturnList(this.Evaluator(tree.stop_, local, fname)),
                            tree.stride_ ? this.reduceIfReturnList(this.Evaluator(tree.stride_, local, fname)) : null,
                        );
                    case 'ENDRANGE': {
                        let parent = tree.parent;
                        let index = tree.index;
                        /* Search for 'IDX' node until reach 'IDX' or root node */
                        while (parent !== null && parent.type !== 'IDX') {
                            index = parent.index;
                            parent = parent.parent;
                        }
                        if (
                            parent &&
                            parent.type === 'IDX' &&
                            parent.expr.id in this.nameTable &&
                            this.nameTable[parent.expr.id].parameter.length === 0 &&
                            this.nameTable[parent.expr.id].expression instanceof MultiArray
                        ) {
                            return parent.args.length === 1
                                ? this.newNumber(this.linearLength(this.nameTable[parent.expr.id].expression))
                                : this.newNumber(this.getDimension(this.nameTable[parent.expr.id].expression, index));
                        } else {
                            throw new SyntaxError("indeterminate end of range. The word 'end' to refer a value is valid only in indexing.");
                        }
                    }
                    case ':':
                        if (
                            tree.parent.type === 'IDX' &&
                            tree.parent.expr.id in this.nameTable &&
                            this.nameTable[tree.parent.expr.id].parameter.length === 0 &&
                            this.nameTable[tree.parent.expr.id].expression instanceof MultiArray
                        ) {
                            return tree.parent.args.length === 1
                                ? this.expandRange(ComplexDecimal.one(), this.newNumber(this.linearLength(this.nameTable[tree.parent.expr.id].expression)))
                                : this.expandRange(ComplexDecimal.one(), this.newNumber(this.getDimension(this.nameTable[tree.parent.expr.id].expression, tree.index)));
                        } else {
                            throw new SyntaxError('indeterminate colon. The colon to refer a range is valid only in indexing.');
                        }
                    case 'IDX':
                        if (typeof tree.expr === 'undefined') {
                            throw new ReferenceError(`'${tree.id}' undefined.`);
                        }
                        tree.expr.parent = tree;
                        if (tree.expr.type === 'IDENT') {
                            /* Indexed matrix reference or function call. */
                            const aliasTreeName = this.aliasName(tree.expr.id);
                            if (aliasTreeName in this.baseFunctionTable) {
                                /* Parameters selectively evaluated if ev.length > 0. */
                                const argumentsList = tree.args.map((arg: AST.NodeExpr, i: number) => {
                                    arg.parent = tree;
                                    arg.index = i;
                                    return this.baseFunctionTable[aliasTreeName].ev.length > 0 &&
                                        i < this.baseFunctionTable[aliasTreeName].ev.length &&
                                        !this.baseFunctionTable[aliasTreeName].ev[i]
                                        ? arg
                                        : this.reduceIfReturnList(this.Evaluator(arg, local, fname));
                                });
                                /* Error if mapper and #arguments!==1 (Invalid call). */
                                if (this.baseFunctionTable[aliasTreeName].mapper && argumentsList.length !== 1) {
                                    throw new EvalError(`Invalid call to ${aliasTreeName}. Type 'help ${tree.expr.id}' to see correct usage.`);
                                }
                                /* If function is mapper an called with one parameter of type MultiArray, apply map to array. Else call function with argumentsList */
                                return this.baseFunctionTable[aliasTreeName].mapper && argumentsList.length === 1 && argumentsList[0] instanceof MultiArray
                                    ? this.mapArray(argumentsList[0], this.baseFunctionTable[aliasTreeName].func)
                                    : this.baseFunctionTable[aliasTreeName].func(...argumentsList);
                            } else if (local && this.localTable[fname] && this.localTable[fname][tree.expr.id]) {
                                /* Defined in localTable. */
                                return this.localTable[fname][tree.expr.id];
                            } else if (tree.expr.id in this.nameTable) {
                                /* Defined in nameTable. */
                                if (this.nameTable[tree.expr.id].parameter.length === 0) {
                                    /* If is a defined name. */
                                    this.nameTable[tree.expr.id].expression.parent = tree;
                                    const temp = this.reduceIfReturnList(this.Evaluator(this.nameTable[tree.expr.id].expression));
                                    if (tree.args.length === 0) {
                                        /* Defined name. */
                                        temp.parent = tree;
                                        return temp;
                                    } else if (temp instanceof MultiArray) {
                                        /* Defined indexed matrix reference. */
                                        let result: MathObject;
                                        if (tree.args.length === 1) {
                                            /* Test logical indexing. */
                                            tree.args[0].parent = tree;
                                            tree.args[0].index = 0;
                                            const arg0 = this.reduceIfReturnList(this.Evaluator(tree.args[0], local, fname));
                                            if (arg0 instanceof MultiArray && arg0.type === ComplexDecimal.LOGICAL) {
                                                /* Logical indexing. */
                                                result = this.getElementsLogical(temp, tree.expr.id, [], arg0);
                                            } else {
                                                /* Not logical indexing. */
                                                result = this.getElements(temp, tree.expr.id, [], [arg0]);
                                            }
                                        } else {
                                            result = this.getElements(
                                                temp,
                                                tree.expr.id,
                                                [],
                                                tree.args.map((arg: AST.NodeExpr, i: number) => {
                                                    arg.parent = tree;
                                                    arg.index = i;
                                                    return this.reduceIfReturnList(this.Evaluator(arg, local, fname));
                                                }),
                                            );
                                        }
                                        result!.parent = tree;
                                        return result;
                                    } else {
                                        throw new EvalError('invalid matrix indexing or function arguments.');
                                    }
                                } else {
                                    /* Else is defined function. */
                                    if (this.nameTable[tree.expr.id].parameter.length !== tree.args.length) {
                                        throw new EvalError(`invalid number of arguments in function ${tree.expr.id}.`);
                                    }
                                    /* Create localTable entry. */
                                    const new_fname = tree.expr.id + '_' + global.crypto.randomUUID();
                                    this.localTable[new_fname] = {};
                                    for (let i = 0; i < tree.args.length; i++) {
                                        /* Evaluate defined function arguments list. */
                                        tree.args[i].parent = tree;
                                        tree.args[i].index = i;
                                        this.localTable[new_fname][this.nameTable[tree.expr.id].parameter[i].id] = this.reduceIfReturnList(
                                            this.Evaluator(tree.args[i], true, fname),
                                        );
                                    }
                                    const temp = this.reduceIfReturnList(this.Evaluator(this.nameTable[tree.expr.id].expression, true, new_fname));
                                    /* Delete localTable entry. */
                                    delete this.localTable[new_fname];
                                    return temp;
                                }
                            } else {
                                throw new ReferenceError(`'${tree.expr.id}' undefined.`);
                            }
                        } else {
                            /* literal indexing, ex: [1,2;3,4](1,2). */
                            let result: MathObject;
                            const expr = this.reduceIfReturnList(this.Evaluator(tree.expr, local, fname));
                            if (tree.args.length === 1) {
                                /* Test logical indexing. */
                                tree.args[0].parent = tree;
                                tree.args[0].index = 0;
                                const arg0 = this.reduceIfReturnList(this.Evaluator(tree.args[0], local, fname));
                                if (arg0 instanceof MultiArray && arg0.type === ComplexDecimal.LOGICAL) {
                                    /* Logical indexing. */
                                    result = this.getElementsLogical(expr, this.Unparse(expr), [], arg0);
                                } else {
                                    /* Not logical indexing. */
                                    result = this.getElements(expr, this.Unparse(expr), [], [arg0]);
                                }
                            } else {
                                result = this.getElements(
                                    expr,
                                    this.Unparse(expr),
                                    [],
                                    tree.args.map((arg: AST.NodeExpr, i: number) => {
                                        arg.parent = tree;
                                        arg.index = i;
                                        return this.reduceIfReturnList(this.Evaluator(arg, local, fname));
                                    }),
                                );
                            }
                            result!.parent = tree;
                            return result;
                        }
                    case 'CMDWLIST':
                        const commandWordListResult = this.commandWordListTable[tree.id].func(...tree.args.map((word: { str: string }) => word.str));
                        return typeof commandWordListResult !== 'undefined' ? commandWordListResult : tree;
                    case 'IF':
                        for (let ifTest = 0; ifTest < tree.expression.length; ifTest++) {
                            tree.expression[ifTest].parent = tree;
                            if (this.toBoolean(this.reduceIfReturnList(this.Evaluator(tree.expression[ifTest], local, fname)))) {
                                tree.then[ifTest].parent = tree;
                                return this.reduceIfReturnList(this.Evaluator(tree.then[ifTest], local, fname));
                            }
                        }
                        // No one then clause.
                        if (tree.else) {
                            tree.else.parent = tree;
                            return this.reduceIfReturnList(this.Evaluator(tree.else, local, fname));
                        }
                        // Return null NodeList.
                        return {
                            type: 'LIST',
                            list: [],
                            parent: tree,
                        };
                    default:
                        throw new EvalError(`evaluating undefined type '${tree.type}'.`);
                }
            }
        } else {
            return null;
        }
    }

    /**
     * Evaluate expression `tree`.
     * @param tree Expression to evaluate.
     * @returns Expression `tree` evaluated.
     */
    public Evaluate(tree: AST.NodeInput): AST.NodeInput {
        try {
            this.exitStatus = this.response.OK;
            tree.parent = null;
            return this.Evaluator(tree);
        } catch (e) {
            this.exitStatus = this.response.EVAL_ERROR;
            throw e;
        }
    }

    /**
     * Unparse expression `tree`.
     * @param tree Expression to unparse.
     * @returns Expression `tree` unparsed.
     */
    public Unparse(tree: AST.NodeInput): string {
        try {
            if (tree) {
                if (tree === undefined) {
                    return '<UNDEFINED>';
                } else if (tree instanceof ComplexDecimal) {
                    /* NUMBER */
                    return this.unparseNumber(tree);
                } else if (tree instanceof CharString) {
                    /* STRING */
                    return this.unparseString(tree);
                } else if (tree instanceof MultiArray) {
                    /* MATRIX */
                    return this.unparseArray(tree, this);
                } else if (tree instanceof Structure) {
                    /* STRUCTURE */
                    return this.unparseStructure(tree, this);
                } else {
                    switch (tree.type) {
                        case '+':
                        case '-':
                        case '.*':
                        case '*':
                        case './':
                        case '/':
                        case '.\\':
                        case '\\':
                        case '.^':
                        case '^':
                        case '.**':
                        case '**':
                        case '<':
                        case '<=':
                        case '==':
                        case '>=':
                        case '>':
                        case '!=':
                        case '~=':
                        case '&':
                        case '|':
                        case '&&':
                        case '||':
                        case '=':
                        case '+=':
                        case '-=':
                        case '*=':
                        case '/=':
                        case '\\=':
                        case '^=':
                        case '**=':
                        case '.*=':
                        case './=':
                        case '.\\=':
                        case '.^=':
                        case '.**=':
                        case '&=':
                        case '|=':
                            return this.Unparse(tree.left) + tree.type + this.Unparse(tree.right);
                        case '()':
                            return '(' + this.Unparse(tree.right) + ')';
                        case '!':
                        case '~':
                            return tree.type + this.Unparse(tree.right);
                        case '+_':
                            return '+' + this.Unparse(tree.right);
                        case '-_':
                            return '-' + this.Unparse(tree.right);
                        case '++_':
                            return '++' + this.Unparse(tree.right);
                        case '--_':
                            return '--' + this.Unparse(tree.right);
                        case ".'":
                        case "'":
                            return this.Unparse(tree.left) + tree.type;
                        case '_++':
                            return this.Unparse(tree.left) + '++';
                        case '_--':
                            return this.Unparse(tree.left) + '--';
                        case 'IDENT':
                            return tree.id.replace(/^[Ii]nf$/, '&infin;');
                        case '.':
                            return (
                                this.Unparse(tree.obj) +
                                '.' +
                                tree.field.map((value: string | AST.NodeExpr) => (typeof value === 'string' ? value : `(${this.Unparse(value)})`)).join('.')
                            );
                        case 'LIST':
                            return tree.list.map((value: AST.NodeInput) => this.Unparse(value)).join('\n') + '\n';
                        case 'RANGE':
                            if (tree.start_ && tree.stop_) {
                                if (tree.stride_) {
                                    return this.Unparse(tree.start_) + ':' + this.Unparse(tree.stride_) + ':' + this.Unparse(tree.stop_);
                                } else {
                                    return this.Unparse(tree.start_) + ':' + this.Unparse(tree.stop_);
                                }
                            } else {
                                return ':';
                            }
                        case 'ENDRANGE':
                            return 'end';
                        case ':':
                            return ':';
                        case '<~>':
                            return '~';
                        case 'IDX':
                            return this.Unparse(tree.expr) + tree.delim[0] + tree.args.map((value: AST.NodeExpr) => this.Unparse(value)).join(',') + tree.delim[1];
                        case 'RETLIST':
                            return '<RETLIST>';
                        case 'CMDWLIST':
                            return (tree.id + ' ' + tree.args.map((arg: CharString) => this.Unparse(arg)).join(' ')).trimEnd();
                        case 'IF':
                            let ifstr = 'IF ' + this.Unparse(tree.expression[0]) + '\n';
                            ifstr += this.Unparse(tree.then[0]) + '\n';
                            for (let i = 1; i < tree.expression.length; i++) {
                                ifstr += 'ELSEIF ' + this.Unparse(tree.expression[i]) + '\n';
                                ifstr += this.Unparse(tree.then[i]) + '\n';
                            }
                            if (tree.else) {
                                ifstr += 'ELSE' + '\n' + this.Unparse(tree.else) + '\n';
                            }
                            ifstr += 'ENDIF';
                            return ifstr;
                        default:
                            return '<INVALID>';
                    }
                }
            } else {
                return '';
            }
        } catch (e) {
            return '<ERROR>';
        }
    }

    /**
     * Unparse recursively expression tree generating MathML representation.
     * @param tree Expression tree.
     * @returns String of expression `tree` unparsed as MathML language.
     */
    public unparserMathML(tree: AST.NodeInput): string {
        try {
            if (tree) {
                if (tree === undefined) {
                    return '<mi>undefined</mi>';
                } else if (tree instanceof ComplexDecimal) {
                    /* NUMBER */
                    return this.unparseNumberMathML(tree);
                } else if (tree instanceof CharString) {
                    /* STRING */
                    return this.unparseStringMathML(tree);
                } else if (tree instanceof MultiArray) {
                    /* MATRIX */
                    return this.unparseArrayMathML(tree, this);
                } else if (tree instanceof Structure) {
                    /* STRUCTURE */
                    return this.unparseStructureMathML(tree, this);
                } else {
                    switch (tree.type) {
                        case '+':
                        case '-':
                        case '.*':
                        case './':
                        case '.\\':
                        case '\\':
                        case '.^':
                        case '.**':
                        case '<':
                        case '>':
                        case '==':
                        case '&':
                        case '|':
                        case '&&':
                        case '||':
                        case '=':
                        case '+=':
                        case '-=':
                        case '*=':
                        case '/=':
                        case '\\=':
                        case '^=':
                        case '**=':
                        case '.*=':
                        case './=':
                        case '.\\=':
                        case '.^=':
                        case '.**=':
                        case '&=':
                        case '|=':
                            return this.unparserMathML(tree.left) + '<mo>' + tree.type + '</mo>' + this.unparserMathML(tree.right);
                        case '<=':
                            return this.unparserMathML(tree.left) + '<mo>&le;</mo>' + this.unparserMathML(tree.right);
                        case '>=':
                            return this.unparserMathML(tree.left) + '<mo>&ge;</mo>' + this.unparserMathML(tree.right);
                        case '!=':
                        case '~=':
                            return this.unparserMathML(tree.left) + '<mo>&ne;</mo>' + this.unparserMathML(tree.right);
                        case '()':
                            return '<mo>(</mo>' + this.unparserMathML(tree.right) + '<mo>)</mo>';
                        case '*':
                            return this.unparserMathML(tree.left) + '<mo>&times;</mo>' + this.unparserMathML(tree.right);
                        case '/':
                            return '<mfrac><mrow>' + this.unparserMathML(tree.left) + '</mrow><mrow>' + this.unparserMathML(tree.right) + '</mrow></mfrac>';
                        case '**':
                        case '^':
                            return '<msup><mrow>' + this.unparserMathML(tree.left) + '</mrow><mrow>' + this.unparserMathML(tree.right) + '</mrow></msup>';
                        case '!':
                        case '~':
                            return '<mo>' + tree.type + '</mo>' + this.unparserMathML(tree.right);
                        case '+_':
                            return '<mo>+</mo>' + this.unparserMathML(tree.right);
                        case '-_':
                            return '<mo>-</mo>' + this.unparserMathML(tree.right);
                        case '++_':
                            return '<mo>++</mo>' + this.unparserMathML(tree.right);
                        case '--_':
                            return '<mo>--</mo>' + this.unparserMathML(tree.right);
                        case '_++':
                            return this.unparserMathML(tree.left) + '<mo>++</mo>';
                        case '_--':
                            return this.unparserMathML(tree.left) + '<mo>--</mo>';
                        case ".'":
                            return '<msup><mrow>' + this.unparserMathML(tree.left) + '</mrow><mrow><mi>T</mi></mrow></msup>';
                        case "'":
                            return '<msup><mrow>' + this.unparserMathML(tree.left) + '</mrow><mrow><mi>H</mi></mrow></msup>';
                        case 'IDENT':
                            return '<mi>' + substSymbol(tree.id) + '</mi>';
                        case '.':
                            return (
                                this.unparserMathML(tree.obj) +
                                '<mo>.</mo>' +
                                tree.field
                                    .map((value: string | AST.NodeExpr) => (typeof value === 'string' ? `<mi>${value}</mi>` : `<mo>(</mo>${this.unparserMathML(value)}<mo>)</mo>`))
                                    .join('<mo>.</mo>')
                            );
                        case 'LIST':
                            return `<mtable>${tree.list.map((value: AST.NodeInput) => `<mtr><mtd>${this.unparserMathML(value)}</mtd></mtr>`).join('')}</mtable>`;
                        case 'RANGE':
                            if (tree.start_ && tree.stop_) {
                                if (tree.stride_) {
                                    return this.unparserMathML(tree.start_) + '<mo>:</mo>' + this.unparserMathML(tree.stride_) + '<mo>:</mo>' + this.unparserMathML(tree.stop_);
                                } else {
                                    return this.unparserMathML(tree.start_) + '<mo>:</mo>' + this.unparserMathML(tree.stop_);
                                }
                            } else {
                                return '<mo>:</mo>';
                            }
                        case 'ENDRANGE':
                            return '<mi>end</mi>';
                        case ':':
                            return '<mo>:</mo>';
                        case '<~>':
                            return '<mo>~</mo>';
                        case 'IDX':
                            if (tree.args.length === 0) {
                                return this.unparserMathML(tree.expr) + `<mrow><mo>${tree.delim[0]}</mo><mo>${tree.delim[1]}</mo></mrow>`;
                            } else {
                                const arglist = tree.args.map((arg: AST.NodeExpr) => this.unparserMathML(arg)).join('<mo>,</mo>');
                                if (tree.expr.type === 'IDENT') {
                                    const aliasTreeName = this.aliasName(tree.expr.id);
                                    if (aliasTreeName in this.baseFunctionTable && this.baseFunctionTable[aliasTreeName].unparserMathML) {
                                        return this.baseFunctionTable[aliasTreeName].unparserMathML!(tree);
                                    } else {
                                        return `<mi>${substSymbol(tree.expr.id)}</mi><mrow><mo>${tree.delim[0]}</mo>${arglist}<mo>${tree.delim[1]}</mo></mrow>`;
                                    }
                                } else {
                                    return `${this.unparserMathML(tree.expr)}<mrow><mo>${tree.delim[0]}</mo>${arglist}<mo>${tree.delim[1]}</mo></mrow>`;
                                }
                            }
                        case 'RETLIST':
                            return '<mi>RETLIST</mi>';
                        case 'CMDWLIST':
                            return '<mtext>' + tree.id + ' ' + tree.args.map((arg: CharString) => this.unparserMathML(arg)).join(' ') + '</mtext>';
                        case 'IF':
                            const ifThenArray = tree.expression.map(
                                (expr: AST.NodeInput, i: number) =>
                                    `<mtr><mtd><mo>${i === 0 ? '<b>if</b>' : '<b>elseif</b>'}</mo></mtd><mtd>${this.unparserMathML(
                                        tree.expression[0],
                                    )}</mtd></mtr><mtr><mtd></mtd><mtd>${this.unparserMathML(tree.then[0])}</mtd></mtr>`,
                            );
                            const ifElse = tree.else ? `<mtr><mtd><mo><b>else</b></mo></mtd></mtr><mtr><mtd></mtd><mtd>${this.unparserMathML(tree.else)}</mtd></mtr>` : '';
                            return `<mtable>${ifThenArray.join('')}${ifElse}<mtr><mtd><mo><b>endif</b></mo></mtd></mtr></mtable>`;
                        default:
                            return '<mi>invalid</mi>';
                    }
                }
            } else {
                return '';
            }
        } catch (e) {
            if (this.debug) {
                throw e;
            } else {
                return '<mi>error</mi>';
            }
        }
    }

    /**
     * Unparse Expression tree in MathML.
     * @param tree Expression tree.
     * @returns String of expression unparsed as MathML language.
     */
    public UnparseMathML(tree: AST.NodeInput, display: 'inline' | 'block' = 'block'): string {
        let result: string = this.unparserMathML(tree);
        if (result) {
            result = result.replace(/\<mo\>\(\<\/mo\>\<mi\>error\<\/mi\><\mi\>error\<\/mi\>\<mi\>i\<\/mi\>\<mo\>\)\<\/mo\>/gi, '<mi>error</mi>');
            return `<math xmlns = "http://www.w3.org/1998/Math/MathML" display="${display}">${result}</math>`;
        } else {
            return '';
        }
    }

    /**
     * Generates MathML representation of input without evaluation.
     * @param input Input to parse and generate MathML representation.
     * @param display `'inline'` or `'block'`.
     * @returns MathML representation of input.
     */
    public toMathML(input: string, display: 'inline' | 'block' = 'block'): string {
        return this.UnparseMathML(this.Parse(input), display);
    }
}
