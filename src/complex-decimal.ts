import { Decimal } from 'decimal.js';

const DecimalPrecision = 336; // to correct rounding of trigonometric functions
const DecimalRounding = Decimal.ROUND_HALF_DOWN;
const DecimaltoExpPos = 20;
const DecimaltoExpNeg = -7;

export class ComplexDecimal {
    public re: Decimal;
    public im: Decimal;
    public cl: 'decimal' | 'logical';

    static mapFunction: { [name: string]: Function } = {
        abs: ComplexDecimal.abs,
        arg: ComplexDecimal.arg,
        conj: ComplexDecimal.conj,
        fix: ComplexDecimal.fix,
        ceil: ComplexDecimal.ceil,
        floor: ComplexDecimal.floor,
        round: ComplexDecimal.round,
        sign: ComplexDecimal.sign,
        sqrt: ComplexDecimal.sqrt,
        exp: ComplexDecimal.exp,
        log: ComplexDecimal.log,
        log10: ComplexDecimal.log10,
        sin: ComplexDecimal.sin,
        cos: ComplexDecimal.cos,
        tan: ComplexDecimal.tan,
        csc: ComplexDecimal.csc,
        sec: ComplexDecimal.sec,
        cot: ComplexDecimal.cot,
        asin: ComplexDecimal.asin,
        acos: ComplexDecimal.acos,
        atan: ComplexDecimal.atan,
        acsc: ComplexDecimal.acsc,
        asec: ComplexDecimal.asec,
        acot: ComplexDecimal.acot,
        sinh: ComplexDecimal.sinh,
        cosh: ComplexDecimal.cosh,
        tanh: ComplexDecimal.tanh,
        csch: ComplexDecimal.csch,
        sech: ComplexDecimal.sech,
        coth: ComplexDecimal.coth,
        asinh: ComplexDecimal.asinh,
        acosh: ComplexDecimal.acosh,
        atanh: ComplexDecimal.atanh,
        acsch: ComplexDecimal.acsch,
        asech: ComplexDecimal.asech,
        acoth: ComplexDecimal.acoth,
        gamma: ComplexDecimal.gamma,
        factorial: ComplexDecimal.factorial,
    };

    static twoArgFunction: { [name: string]: Function } = {
        root: ComplexDecimal.root,
        pow: ComplexDecimal.pow,
        logbl: ComplexDecimal.logbl,
    };

    constructor(re: number | string | Decimal, im: number | string | Decimal, cl?: 'decimal' | 'logical') {
        this.re = new Decimal(re);
        this.im = new Decimal(im);
        this.cl = cl ? cl : 'decimal';
    }

    static set(config?: Decimal.Config) {
        if (config) {
            Decimal.set(config);
        } else {
            Decimal.set({ precision: DecimalPrecision, rounding: DecimalRounding, toExpNeg: DecimaltoExpNeg, toExpPos: DecimaltoExpPos });
        }
    }

    static isThis(obj: any): boolean {
        return 're' in obj;
    }

    static newThis(re: number | string | Decimal, im: number | string | Decimal, cl?: 'decimal' | 'logical'): ComplexDecimal {
        return new ComplexDecimal(re, im, cl);
    }

    static parse(value: string): ComplexDecimal {
        const num = (value as string).toLowerCase().replace('d', 'e');
        if (num[num.length - 1] == 'i' || num[num.length - 1] == 'j') {
            return new ComplexDecimal(0, num.substring(0, num.length - 1));
        } else {
            return new ComplexDecimal(num, 0);
        }
    }

    static unparseDecimal(value: Decimal): string {
        if (value.isFinite()) {
            const value_unparsed = value.toString().split('e');
            if (value_unparsed.length == 1) {
                return value_unparsed[0].slice(0, Decimal.toExpPos);
            } else {
                return value_unparsed[0].slice(0, Decimal.toExpPos) + 'e' + Number(value_unparsed[1]);
            }
        } else {
            return value.isNaN() ? 'NaN' : (value.isNegative() ? '-' : '') + '&infin;';
        }
    }

    static unparse(value: ComplexDecimal): string {
        const value_prec = ComplexDecimal.toMaxPrecision(value);
        if (!value_prec.re.eq(0) && !value_prec.im.eq(0)) {
            return (
                '(' +
                ComplexDecimal.unparseDecimal(value_prec.re) +
                (value_prec.im.gt(0) ? '+' : '') +
                (!value_prec.im.eq(1) ? (!value_prec.im.eq(-1) ? ComplexDecimal.unparseDecimal(value_prec.im) : '-') : '') +
                'i)'
            );
        } else if (!value_prec.re.eq(0)) {
            return ComplexDecimal.unparseDecimal(value_prec.re);
        } else if (!value_prec.im.eq(0)) {
            return (!value_prec.im.eq(1) ? (!value_prec.im.eq(-1) ? ComplexDecimal.unparseDecimal(value_prec.im) : '-') : '') + 'i';
        } else {
            return '0';
        }
    }

    static unparseDecimalML(value: Decimal): string {
        if (value.isFinite()) {
            const value_unparsed = value.toString().split('e');
            if (value_unparsed.length == 1) {
                return '<mn>' + value_unparsed[0].slice(0, Decimal.toExpPos) + '</mn>';
            } else {
                return (
                    '<mn>' +
                    value_unparsed[0].slice(0, Decimal.toExpPos) +
                    '</mn><mo>&sdot;</mo><msup><mrow><mn>10</mn></mrow><mrow><mn>' +
                    Number(value_unparsed[1]) +
                    '</mn></mrow></msup>'
                );
            }
        } else {
            return value.isNaN() ? '<mi>NaN</mi>' : (value.isNegative() ? '<mo>-</mo>' : '') + '<mi>&infin;</mi>';
        }
    }

    static unparseML(value: ComplexDecimal): string {
        const value_prec = ComplexDecimal.toMaxPrecision(value);
        if (!value_prec.re.eq(0) && !value_prec.im.eq(0)) {
            return (
                '<mo>(</mo>' +
                ComplexDecimal.unparseDecimalML(value_prec.re) +
                (value_prec.im.gt(0) ? '<mo>+</mo>' : '') +
                (!value_prec.im.eq(1) ? (!value_prec.im.eq(-1) ? ComplexDecimal.unparseDecimalML(value_prec.im) : '<mo>-</mo>') : '') +
                '<mi>i</mi><mo>)</mo>'
            );
        } else if (!value_prec.re.eq(0)) {
            return ComplexDecimal.unparseDecimalML(value_prec.re);
        } else if (!value_prec.im.eq(0)) {
            return (
                (!value_prec.im.eq(1) ? (!value_prec.im.eq(-1) ? ComplexDecimal.unparseDecimalML(value_prec.im) : '<mo>-</mo>') : '') + '<mi>i</mi>'
            );
        } else {
            return '<mn>0</mn>';
        }
    }

    static clone(value: ComplexDecimal): ComplexDecimal {
        return new ComplexDecimal(value.re, value.im, value.cl);
    }

    static cast(value: ComplexDecimal, cl?: 'decimal' | 'logical'): ComplexDecimal {
        if (cl) {
            value.cl = cl;
        } else {
            value.cl = 'decimal';
        }
        return value;
    }

    static toMaxPrecisionDecimal(value: Decimal): Decimal {
        return value.toSignificantDigits(Decimal.precision - 7).toDecimalPlaces(Decimal.precision - 7);
    }

    static toMaxPrecision(value: ComplexDecimal): ComplexDecimal {
        return new ComplexDecimal(
            value.re.toSignificantDigits(Decimal.precision - 7).toDecimalPlaces(Decimal.precision - 7),
            value.im.toSignificantDigits(Decimal.precision - 7).toDecimalPlaces(Decimal.precision - 7),
        );
    }

    static epsilonDecimal(): Decimal {
        return Decimal.pow(10, -Decimal.precision + 7);
    }

    static epsilon(): ComplexDecimal {
        return new ComplexDecimal(Decimal.pow(10, -Decimal.precision + 7), 0);
    }

    static min(left: ComplexDecimal, right: ComplexDecimal): ComplexDecimal {
        if (left.im.eq(0) && right.im.eq(0)) {
            return left.re.lte(right.re) ? left : right;
        } else {
            const left_abs = ComplexDecimal.abs(left).re;
            const right_abs = ComplexDecimal.abs(right).re;
            if (left_abs.eq(right_abs)) {
                return ComplexDecimal.arg(left).re.lte(ComplexDecimal.arg(right).re) ? left : right;
            } else {
                return left_abs.lte(right_abs) ? left : right;
            }
        }
    }

    static max(left: ComplexDecimal, right: ComplexDecimal): ComplexDecimal {
        if (left.im.eq(0) && right.im.eq(0)) {
            return left.re.gte(right.re) ? left : right;
        } else {
            const left_abs = ComplexDecimal.abs(left).re;
            const right_abs = ComplexDecimal.abs(right).re;
            if (left_abs.eq(right_abs)) {
                return ComplexDecimal.arg(left).re.gte(ComplexDecimal.arg(right).re) ? left : right;
            } else {
                return left_abs.gte(right_abs) ? left : right;
            }
        }
    }

    static eq(left: ComplexDecimal, right: ComplexDecimal): ComplexDecimal {
        const left_prec = ComplexDecimal.toMaxPrecision(left);
        const right_prec = ComplexDecimal.toMaxPrecision(right);
        return left_prec.re.eq(right_prec.re) && left_prec.im.eq(right_prec.im) ? ComplexDecimal.true() : ComplexDecimal.false();
    }

    static ne(left: ComplexDecimal, right: ComplexDecimal): ComplexDecimal {
        const left_prec = ComplexDecimal.toMaxPrecision(left);
        const right_prec = ComplexDecimal.toMaxPrecision(right);
        return !left_prec.re.eq(right_prec.re) || !left_prec.im.eq(right_prec.im) ? ComplexDecimal.true() : ComplexDecimal.false();
    }

    static cmp(cmp: 'lt' | 'lte' | 'gt' | 'gte', left: ComplexDecimal, right: ComplexDecimal): ComplexDecimal {
        // Comparisons made in polar lexicographical ordering
        // (ordered by absolute value, or by polar angle in (-pi,pi] when absolute values are equal)
        const left_prec = ComplexDecimal.toMaxPrecision(left);
        const right_prec = ComplexDecimal.toMaxPrecision(right);
        if (left_prec.im.eq(0) && right_prec.im.eq(0)) {
            return left_prec.re[cmp](right_prec.re) ? ComplexDecimal.true() : ComplexDecimal.false();
        }
        const left_abs = ComplexDecimal.toMaxPrecisionDecimal(ComplexDecimal.abs(left).re);
        const right_abs = ComplexDecimal.toMaxPrecisionDecimal(ComplexDecimal.abs(right).re);
        if (!left_abs.eq(right_abs)) {
            return left_abs[cmp](right_abs) ? ComplexDecimal.true() : ComplexDecimal.false();
        } else {
            return ComplexDecimal.toMaxPrecisionDecimal(ComplexDecimal.arg(left).re)[cmp](
                ComplexDecimal.toMaxPrecisionDecimal(ComplexDecimal.arg(right).re),
            )
                ? ComplexDecimal.true()
                : ComplexDecimal.false();
        }
    }

    static lt(left: ComplexDecimal, right: ComplexDecimal): ComplexDecimal {
        return ComplexDecimal.cmp('lt', left, right);
    }

    static lte(left: ComplexDecimal, right: ComplexDecimal): ComplexDecimal {
        return ComplexDecimal.cmp('lte', left, right);
    }

    static gte(left: ComplexDecimal, right: ComplexDecimal): ComplexDecimal {
        return ComplexDecimal.cmp('gte', left, right);
    }

    static gt(left: ComplexDecimal, right: ComplexDecimal): ComplexDecimal {
        return ComplexDecimal.cmp('gt', left, right);
    }

    static false(): ComplexDecimal {
        return new ComplexDecimal(0, 0, 'logical');
    }

    static true(): ComplexDecimal {
        return new ComplexDecimal(1, 0, 'logical');
    }

    static toLogical(value: ComplexDecimal): ComplexDecimal {
        const value_prec = ComplexDecimal.toMaxPrecision(value);
        return !value_prec.re.eq(0) || !value_prec.im.eq(0) ? ComplexDecimal.true() : ComplexDecimal.false();
    }

    static and(left: ComplexDecimal, right: ComplexDecimal): ComplexDecimal {
        const left_prec = ComplexDecimal.toMaxPrecision(left);
        const right_prec = ComplexDecimal.toMaxPrecision(right);
        return (!left_prec.re.eq(0) || !left_prec.im.eq(0)) && (!right_prec.re.eq(0) || !right_prec.im.eq(0))
            ? ComplexDecimal.true()
            : ComplexDecimal.false();
    }

    static or(left: ComplexDecimal, right: ComplexDecimal): ComplexDecimal {
        const left_prec = ComplexDecimal.toMaxPrecision(left);
        const right_prec = ComplexDecimal.toMaxPrecision(right);
        return !left_prec.re.eq(0) || !left_prec.im.eq(0) || !right_prec.re.eq(0) || !right_prec.im.eq(0)
            ? ComplexDecimal.true()
            : ComplexDecimal.false();
    }

    static not(right: ComplexDecimal): ComplexDecimal {
        const right_prec = ComplexDecimal.toMaxPrecision(right);
        return !right_prec.re.eq(0) || !right_prec.im.eq(0) ? ComplexDecimal.false() : ComplexDecimal.true();
    }

    static zero(): ComplexDecimal {
        return new ComplexDecimal(0, 0);
    }

    static one(): ComplexDecimal {
        return new ComplexDecimal(1, 0);
    }

    static onediv2(): ComplexDecimal {
        return new ComplexDecimal(1 / 2, 0);
    }

    static minusonediv2(): ComplexDecimal {
        return new ComplexDecimal(-1 / 2, 0);
    }

    static minusone(): ComplexDecimal {
        return new ComplexDecimal(-1, 0);
    }

    static pi(): ComplexDecimal {
        return new ComplexDecimal(Decimal.acos(-1), 0);
    }

    static pidiv2(): ComplexDecimal {
        return new ComplexDecimal(Decimal.div(Decimal.acos(-1), 2), 0);
    }

    static onei(): ComplexDecimal {
        return new ComplexDecimal(0, 1);
    }

    static onediv2i(): ComplexDecimal {
        return new ComplexDecimal(0, 1 / 2);
    }

    static minusonediv2i(): ComplexDecimal {
        return new ComplexDecimal(0, -1 / 2);
    }

    static minusonei(): ComplexDecimal {
        return new ComplexDecimal(0, -1);
    }

    static two(): ComplexDecimal {
        return new ComplexDecimal(2, 0);
    }

    static sqrt2pi(): ComplexDecimal {
        return new ComplexDecimal(Decimal.sqrt(Decimal.mul(2, Decimal.acos(-1))), 0);
    }

    static e(): ComplexDecimal {
        return new ComplexDecimal(Decimal.exp(1), 0);
    }

    static NaN_0(): ComplexDecimal {
        return new ComplexDecimal(NaN, 0);
    }

    static inf_0(): ComplexDecimal {
        return new ComplexDecimal(Infinity, 0);
    }

    static add(left: ComplexDecimal, right: ComplexDecimal): ComplexDecimal {
        return new ComplexDecimal(Decimal.add(left.re, right.re), Decimal.add(left.im, right.im));
    }

    static sub(left: ComplexDecimal, right: ComplexDecimal): ComplexDecimal {
        return new ComplexDecimal(Decimal.sub(left.re, right.re), Decimal.sub(left.im, right.im));
    }

    static neg(z: ComplexDecimal): ComplexDecimal {
        return new ComplexDecimal(z.re.neg(), z.im.neg());
    }

    static mul(left: ComplexDecimal, right: ComplexDecimal): ComplexDecimal {
        if (left.im.eq(0) && right.im.eq(0)) {
            return new ComplexDecimal(Decimal.mul(left.re, right.re), new Decimal(0));
        } else {
            return new ComplexDecimal(
                Decimal.sub(Decimal.mul(left.re, right.re), Decimal.mul(left.im, right.im)),
                Decimal.add(Decimal.mul(left.re, right.im), Decimal.mul(left.im, right.re)),
            );
        }
    }

    static rdiv(left: ComplexDecimal, right: ComplexDecimal): ComplexDecimal {
        const denom = Decimal.add(Decimal.mul(right.re, right.re), Decimal.mul(right.im, right.im));
        if (denom.isFinite()) {
            if (denom.eq(0)) {
                return new ComplexDecimal(Decimal.mul(left.re, Infinity), left.im.eq(0) ? new Decimal(0) : Decimal.mul(left.im, Infinity));
            } else {
                return new ComplexDecimal(
                    Decimal.div(Decimal.add(Decimal.mul(left.re, right.re), Decimal.mul(left.im, right.im)), denom),
                    Decimal.div(Decimal.sub(Decimal.mul(left.im, right.re), Decimal.mul(left.re, right.im)), denom),
                );
            }
        } else {
            if (denom.isNaN()) {
                if ((!right.re.isFinite() && !right.re.isNaN()) || (!right.im.isFinite() && !right.im.isNaN())) {
                    return ComplexDecimal.zero();
                } else {
                    return new ComplexDecimal(NaN, 0);
                }
            } else if (left.re.isFinite() && left.im.isFinite()) {
                return ComplexDecimal.zero();
            } else {
                return new ComplexDecimal(NaN, 0);
            }
        }
    }

    static inv(right: ComplexDecimal): ComplexDecimal {
        //        return ComplexDecimal.rdiv(ComplexDecimal.one(),right);
        const denom = Decimal.add(Decimal.mul(right.re, right.re), Decimal.mul(right.im, right.im));
        if (denom.isFinite()) {
            if (denom.eq(0)) {
                return new ComplexDecimal(Infinity, 0);
            } else {
                return new ComplexDecimal(Decimal.div(right.re, denom), Decimal.div(right.im, denom).neg());
            }
        } else {
            if (denom.isNaN()) {
                if ((!right.re.isFinite() && !right.re.isNaN()) || (!right.im.isFinite() && !right.im.isNaN())) {
                    return ComplexDecimal.zero();
                } else {
                    return new ComplexDecimal(NaN, 0);
                }
            } else {
                return ComplexDecimal.zero();
            }
        }
    }

    static ldiv(left: ComplexDecimal, right: ComplexDecimal): ComplexDecimal {
        return ComplexDecimal.rdiv(right, left);
    }

    static pow(left: ComplexDecimal, right: ComplexDecimal): ComplexDecimal {
        // pow(base,exponent)
        if (left.im.eq(0) && right.im.eq(0) && left.re.gte(0)) {
            return new ComplexDecimal(Decimal.pow(left.re, right.re), new Decimal(0));
        } else {
            const arg_left = Decimal.atan2(left.im.eq(0) ? 0 : left.im, left.re.eq(0) ? 0 : left.re);
            const mod2_left = Decimal.add(Decimal.mul(left.re, left.re), Decimal.mul(left.im, left.im));
            const mul = Decimal.mul(Decimal.pow(mod2_left, Decimal.div(right.re, 2)), Decimal.exp(Decimal.mul(Decimal.mul(-1, right.im), arg_left)));
            const trig = Decimal.add(Decimal.mul(right.re, arg_left), Decimal.mul(Decimal.div(right.im, 2), Decimal.ln(mod2_left)));
            return new ComplexDecimal(
                Decimal.mul(mul, Decimal.cos(trig)),
                left.im.eq(0) && right.im.eq(0) && (right.re.gte(1) || right.re.lte(-1)) ? 0 : Decimal.mul(mul, Decimal.sin(trig)),
            );
        }
    }

    static root(x: ComplexDecimal, y: ComplexDecimal): ComplexDecimal {
        return ComplexDecimal.pow(x, ComplexDecimal.rdiv(ComplexDecimal.one(), y));
    }

    static abs(z: ComplexDecimal): ComplexDecimal {
        return z.im.eq(0)
            ? new ComplexDecimal(Decimal.abs(z.re), 0)
            : new ComplexDecimal(Decimal.sqrt(Decimal.add(Decimal.mul(z.re, z.re), Decimal.mul(z.im, z.im))), 0);
    }

    static arg(z: ComplexDecimal): ComplexDecimal {
        return new ComplexDecimal(Decimal.atan2(z.im.eq(0) ? 0 : z.im, z.re) /*test if imaginary part is 0 to change -0 to 0*/, 0);
    }

    static conj(z: ComplexDecimal): ComplexDecimal {
        return new ComplexDecimal(new Decimal(z.re), z.im.neg());
    }

    static fix(z: ComplexDecimal): ComplexDecimal {
        return new ComplexDecimal(Decimal.trunc(z.re), Decimal.trunc(z.im));
    }

    static ceil(z: ComplexDecimal): ComplexDecimal {
        return new ComplexDecimal(Decimal.ceil(z.re), Decimal.ceil(z.im));
    }

    static floor(z: ComplexDecimal): ComplexDecimal {
        return new ComplexDecimal(Decimal.floor(z.re), Decimal.floor(z.im));
    }

    static round(z: ComplexDecimal): ComplexDecimal {
        return new ComplexDecimal(Decimal.round(z.re), Decimal.round(z.im));
    }

    static sign(z: ComplexDecimal): ComplexDecimal {
        if (z.re.eq(0)) {
            if (z.im.eq(0)) {
                return ComplexDecimal.zero();
            } else {
                return new ComplexDecimal(0, Decimal.div(z.im, Decimal.sqrt(Decimal.add(Decimal.mul(z.re, z.re), Decimal.mul(z.im, z.im)))));
            }
        } else {
            if (z.im.eq(0)) {
                return new ComplexDecimal(Decimal.div(z.re, Decimal.sqrt(Decimal.add(Decimal.mul(z.re, z.re), Decimal.mul(z.im, z.im)))), 0);
            } else {
                return new ComplexDecimal(
                    Decimal.div(z.re, Decimal.sqrt(Decimal.add(Decimal.mul(z.re, z.re), Decimal.mul(z.im, z.im)))),
                    Decimal.div(z.im, Decimal.sqrt(Decimal.add(Decimal.mul(z.re, z.re), Decimal.mul(z.im, z.im)))),
                );
            }
        }
    }

    static sqrt(z: ComplexDecimal): ComplexDecimal {
        // square root
        const mod_z = Decimal.sqrt(Decimal.add(Decimal.mul(z.re, z.re), Decimal.mul(z.im, z.im)));
        const arg_z = Decimal.atan2(z.im.eq(0) ? 0 : z.im, z.re);
        return new ComplexDecimal(
            Decimal.mul(Decimal.sqrt(mod_z), Decimal.cos(Decimal.div(arg_z, 2))),
            Decimal.mul(Decimal.sqrt(mod_z), Decimal.sin(Decimal.div(arg_z, 2))),
        );
    }

    static exp(z: ComplexDecimal): ComplexDecimal {
        // E^x (exponential)
        return new ComplexDecimal(Decimal.mul(Decimal.exp(z.re), Decimal.cos(z.im)), Decimal.mul(Decimal.exp(z.re), Decimal.sin(z.im)));
    }

    static log(z: ComplexDecimal): ComplexDecimal {
        // natural logarithm
        return new ComplexDecimal(
            Decimal.ln(Decimal.sqrt(Decimal.add(Decimal.mul(z.re, z.re), Decimal.mul(z.im, z.im)))),
            Decimal.atan2(z.im.eq(0) ? 0 : z.im, z.re),
        );
    }

    static logbl(b: ComplexDecimal, l: ComplexDecimal): ComplexDecimal {
        // logarithm(base,logarithm)
        const mod_b = Decimal.sqrt(Decimal.add(Decimal.mul(b.re, b.re), Decimal.mul(b.im, b.im)));
        if (mod_b.eq(0)) {
            return ComplexDecimal.zero();
        } else {
            const arg_b = Decimal.atan2(b.im.eq(0) ? 0 : b.im, b.re);
            const mod_l = Decimal.sqrt(Decimal.add(Decimal.mul(l.re, l.re), Decimal.mul(l.im, l.im)));
            const arg_l = Decimal.atan2(l.im.eq(0) ? 0 : l.im, l.re);
            const denom = Decimal.add(Decimal.mul(Decimal.ln(mod_b), Decimal.ln(mod_b)), Decimal.mul(arg_b, arg_b));
            return new ComplexDecimal(
                Decimal.div(Decimal.add(Decimal.mul(Decimal.ln(mod_l), Decimal.ln(mod_b)), Decimal.mul(arg_l, arg_b)), denom),
                Decimal.div(Decimal.sub(Decimal.mul(arg_l, Decimal.ln(mod_b)), Decimal.mul(Decimal.ln(mod_l), arg_b)), denom),
            );
        }
    }

    static log10(z: ComplexDecimal): ComplexDecimal {
        // logarithm base 10
        return ComplexDecimal.logbl(new ComplexDecimal(10, 0), z);
    }

    static sin(z: ComplexDecimal): ComplexDecimal {
        // trignometric sine
        return new ComplexDecimal(Decimal.mul(Decimal.sin(z.re), Decimal.cosh(z.im)), Decimal.mul(Decimal.cos(z.re), Decimal.sinh(z.im)));
    }

    static cos(z: ComplexDecimal): ComplexDecimal {
        // trigonometric cosine
        return new ComplexDecimal(Decimal.mul(Decimal.cos(z.re), Decimal.cosh(z.im)), Decimal.mul(Decimal.sin(z.re), Decimal.sinh(z.im)).neg());
    }

    static tan(z: ComplexDecimal): ComplexDecimal {
        // trigonometric tangent: tan(z) = sin(z)/cos(z)
        return ComplexDecimal.rdiv(ComplexDecimal.sin(z), ComplexDecimal.cos(z));
    }

    static csc(z: ComplexDecimal): ComplexDecimal {
        // trigonometric cosecant: csc(z)=1/sin(z)
        return ComplexDecimal.rdiv(ComplexDecimal.one(), ComplexDecimal.sin(z));
    }

    static sec(z: ComplexDecimal): ComplexDecimal {
        // trigonometric secant: sec(z) = 1/cos(z)
        return ComplexDecimal.rdiv(ComplexDecimal.one(), ComplexDecimal.cos(z));
    }

    static cot(z: ComplexDecimal): ComplexDecimal {
        // trigonometric cotangent: cot(z) = cos(z)/sin(z)
        return ComplexDecimal.rdiv(ComplexDecimal.cos(z), ComplexDecimal.sin(z));
    }

    static asin(z: ComplexDecimal): ComplexDecimal {
        // arc sine: asin(z) = I*ln(sqrt(1-z^2)-I*z)
        return ComplexDecimal.rdiv(
            ComplexDecimal.onei(),
            ComplexDecimal.log(
                ComplexDecimal.sub(
                    ComplexDecimal.sqrt(ComplexDecimal.sub(ComplexDecimal.one(), ComplexDecimal.pow(z, ComplexDecimal.two()))),
                    ComplexDecimal.mul(ComplexDecimal.onei(), z),
                ),
            ),
        );
    }

    static acos(z: ComplexDecimal): ComplexDecimal {
        // arc cosine: acos(z) = pi/2-asin(z)
        return ComplexDecimal.sub(ComplexDecimal.pidiv2(), ComplexDecimal.asin(z));
    }

    static atan(z: ComplexDecimal): ComplexDecimal {
        // arc tangent: atan(z) = -I/2*ln((I-z)/(I+z))
        return ComplexDecimal.mul(
            ComplexDecimal.minusonediv2i(),
            ComplexDecimal.log(ComplexDecimal.rdiv(ComplexDecimal.sub(ComplexDecimal.onei(), z), ComplexDecimal.add(ComplexDecimal.onei(), z))),
        );
    }

    static acsc(z: ComplexDecimal): ComplexDecimal {
        // arc cosecant: acsc(z) = asin(1/z)
        return ComplexDecimal.rdiv(ComplexDecimal.one(), ComplexDecimal.asin(z));
    }

    static asec(z: ComplexDecimal): ComplexDecimal {
        // arc secant: asec(z) = acos(1/z)
        return ComplexDecimal.rdiv(ComplexDecimal.one(), ComplexDecimal.acos(z));
    }

    static acot(z: ComplexDecimal): ComplexDecimal {
        // arc cotangent: acot(z) = atan(1/z)
        return ComplexDecimal.rdiv(ComplexDecimal.one(), ComplexDecimal.atan(z));
    }

    static sinh(z: ComplexDecimal): ComplexDecimal {
        // hyperbolic sine
        return new ComplexDecimal(Decimal.mul(Decimal.sinh(z.re), Decimal.cos(z.im)), Decimal.mul(Decimal.cosh(z.re), Decimal.sin(z.im)));
    }

    static cosh(z: ComplexDecimal): ComplexDecimal {
        // hyperbolic cosine
        return new ComplexDecimal(Decimal.mul(Decimal.cosh(z.re), Decimal.cos(z.im)), Decimal.mul(Decimal.sinh(z.re), Decimal.sin(z.im)));
    }

    static tanh(z: ComplexDecimal): ComplexDecimal {
        // hyperbolic tangent: tanh(z) = sinh(z)/cosh(z)
        return ComplexDecimal.rdiv(ComplexDecimal.sinh(z), ComplexDecimal.cosh(z));
    }

    static csch(z: ComplexDecimal): ComplexDecimal {
        // trigonometric cosecant: csch(z)=1/sinh(z)
        return ComplexDecimal.rdiv(ComplexDecimal.one(), ComplexDecimal.sinh(z));
    }

    static sech(z: ComplexDecimal): ComplexDecimal {
        // trigonometric secant: sech(z) = 1/cosh(z)
        return ComplexDecimal.rdiv(ComplexDecimal.one(), ComplexDecimal.cosh(z));
    }

    static coth(z: ComplexDecimal): ComplexDecimal {
        // trigonometric cotangent: coth(z) = cosh(z)/sinh(z)
        return ComplexDecimal.rdiv(ComplexDecimal.cosh(z), ComplexDecimal.sinh(z));
    }

    static asinh(z: ComplexDecimal): ComplexDecimal {
        // area hyperbolic sine: asinh(z) = ln(sqrt(1+z^2)+z)
        return ComplexDecimal.log(
            ComplexDecimal.add(ComplexDecimal.sqrt(ComplexDecimal.add(ComplexDecimal.one(), ComplexDecimal.pow(z, ComplexDecimal.two()))), z),
        );
    }

    static acosh(z: ComplexDecimal): ComplexDecimal {
        // area hyperbolic cosine: acosh(z) = ln(sqrt(-1+z^2)+z)
        return ComplexDecimal.log(
            ComplexDecimal.add(ComplexDecimal.sqrt(ComplexDecimal.add(ComplexDecimal.minusone(), ComplexDecimal.pow(z, ComplexDecimal.two()))), z),
        );
    }

    static atanh(z: ComplexDecimal): ComplexDecimal {
        // area hyperbolic tangent: atanh(z) = 1/2*ln((1+z)/(1-z))
        return ComplexDecimal.mul(
            ComplexDecimal.onediv2(),
            ComplexDecimal.log(ComplexDecimal.rdiv(ComplexDecimal.add(ComplexDecimal.one(), z), ComplexDecimal.sub(ComplexDecimal.one(), z))),
        );
    }

    static acsch(z: ComplexDecimal): ComplexDecimal {
        // area hyperbolic cosecant: acsch(z) = asinh(1/z)
        return ComplexDecimal.rdiv(ComplexDecimal.one(), ComplexDecimal.asinh(z));
    }

    static asech(z: ComplexDecimal): ComplexDecimal {
        // area hyperbolic secant: asech(z) = acosh(1/z)
        return ComplexDecimal.rdiv(ComplexDecimal.one(), ComplexDecimal.acosh(z));
    }

    static acoth(z: ComplexDecimal): ComplexDecimal {
        // area hyperbolic cotangent: acoth(z) = atanh(1/z)
        return ComplexDecimal.rdiv(ComplexDecimal.one(), ComplexDecimal.atanh(z));
    }

    /**
     * -- gamma (Z)
     * Compute the Gamma function.
     * The Gamma function is defined as
     *                   infinity
     *                  /
     *      gamma (z) = | t^(z-1) exp (-t) dt.
     *                  /
     *               t=0
     * https://rosettacode.org/wiki/Gamma_function#JavaScript
     * https://en.wikipedia.org/wiki/Lanczos_approximation
     * https://math.stackexchange.com/questions/19236/algorithm-to-compute-gamma-function
     * https://en.wikipedia.org/wiki/Gamma_function#Stirling's_formula
     * https://mathworld.wolfram.com/GammaFunction.html
     * https://www.geeksforgeeks.org/gamma-function/
     * https://octave.org/doxygen/dev/d0/d77/gamma_8f_source.html
     * @param z
     * @returns
     */
    static gamma(z: ComplexDecimal): ComplexDecimal {
        const p = [
            '0.99999999999980993',
            '676.5203681218851',
            '-1259.1392167224028',
            '771.32342877765313',
            '-176.61502916214059',
            '12.507343278686905',
            '-0.13857109526572012',
            '9.9843695780195716e-6',
            '1.5056327351493116e-7',
        ];
        if (z.re.lt(0.5)) {
            return ComplexDecimal.rdiv(
                ComplexDecimal.pi(),
                ComplexDecimal.mul(
                    ComplexDecimal.sin(ComplexDecimal.mul(ComplexDecimal.pi(), z)),
                    ComplexDecimal.gamma(ComplexDecimal.sub(ComplexDecimal.one(), z)),
                ),
            );
        } else {
            z = ComplexDecimal.sub(z, ComplexDecimal.one());
            let x = new ComplexDecimal(p[0], 0);
            const t = ComplexDecimal.add(z, new ComplexDecimal(new Decimal(p.length - 1.5), new Decimal(0)));
            for (let i = 1; i < p.length; i++) {
                x = ComplexDecimal.add(x, ComplexDecimal.rdiv(new ComplexDecimal(p[i], 0), ComplexDecimal.add(z, new ComplexDecimal(i, 0))));
            }
            return ComplexDecimal.mul(
                ComplexDecimal.mul(ComplexDecimal.sqrt2pi(), ComplexDecimal.pow(t, ComplexDecimal.add(z, new ComplexDecimal(0.5, 0)))),
                ComplexDecimal.mul(ComplexDecimal.exp(ComplexDecimal.neg(t)), x),
            );
        }
    }

    static factorial(x: ComplexDecimal) {
        if (x.re.lt(0) || !x.re.trunc().eq(x.re) || !x.im.eq(0)) throw new Error('factorial: all N must be real non-negative integers');
        const result = ComplexDecimal.gamma(ComplexDecimal.add(new ComplexDecimal(x.re.round(), 0), ComplexDecimal.one()));
        result.re = result.re.trunc();
        return result;
    }
}
