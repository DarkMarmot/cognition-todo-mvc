(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global.Muta = factory());
}(this, (function () { 'use strict';

function isPrivate(name){
    return name[0] === '_'  || (isAction(name) && name[1] === '_');
}

function isAction(name){
    return name[0] === '$';
}

class Data {

    // should only be created via Scope methods

    constructor(scope, name) {

        this._scope       = scope;
        this._action      = isAction(name);
        this._name        = name;
        this._dead        = false;
        this._value       = undefined;
        this._present     = false;  // true if a value has been received
        this._private     = isPrivate(name);
        this._readable    = !this._action;
        this._writable    = true; // false when mirrored or calculated?
        this._subscribers = [];

    };

    get scope() { return this._scope; };
    get name() { return this._name; };
    get dead() { return this._dead; };
    get present() { return this._present; };
    get private() { return this._private; };

    destroy(){

        this._scope = null;
        this._subscribers = null;
        this._dead = true;

    };

    subscribe(listener, pull){

        this._subscribers.unshift(listener);

        if(pull && this._present)
            listener.call(null, this._value, this._name);

        return this;

    };

    unsubscribe(listener){


        let i = this._subscribers.indexOf(listener);

        if(i !== -1)
            this._subscribers.splice(i, 1);

        return this;

    };

    silentWrite(msg){

        this.write(msg, true);

    };

    read(){

        return this._value;

    };

    write(msg, silent){

        _ASSERT_WRITE_ACCESS(this);

        if(!this._action) { // states store the last value seen
            this._present = true;
            this._value = msg;
        }

        if(!silent) {
            let i = this._subscribers.length;
            while (i--) {
                this._subscribers[i].call(null, msg, this._name);
            }
        }

    };

    refresh(){

        if(this._present)
            this.write(this._value);

        return this;

    };

    toggle(){

        this.write(!this._value);

        return this;

    };

}


function _ASSERT_WRITE_ACCESS(d){
    if(!d._writable)
        throw new Error('States accessed from below are read-only. Named: ' + d._name);
}

function NoopSource() {
    this.name = '';
}

NoopSource.prototype.init = function init() {};
NoopSource.prototype.pull = function pull() {};
NoopSource.prototype.destroy = function destroy() {};


const stubs = {init:'init', pull:'pull', destroy:'destroy'};

NoopSource.prototype.addStubs = function addStubs(sourceClass) {

    for(const name in stubs){
        const ref = stubs[name];
        const f = NoopSource.prototype[ref];
        if(typeof sourceClass.prototype[name] !== 'function'){
            sourceClass.prototype[name] = f;
        }
    }

};

const NOOP_SOURCE = new NoopSource();

function NoopStream() {
    this.name = '';
}

NoopStream.prototype.handle = function handle(msg, source) {};
NoopStream.prototype.reset = function reset() {};
NoopStream.prototype.emit = function emit() {};

NoopStream.prototype.resetDefault = function reset() {
    this.next.reset();
};

const stubs$1 = {handle:'handle', reset:'resetDefault', emit:'emit'};

NoopStream.prototype.addStubs = function addStubs(streamClass) {

    for(const name in stubs$1){
        const ref = stubs$1[name];
        const f = NoopStream.prototype[ref];
        if(typeof streamClass.prototype[name] !== 'function'){
            streamClass.prototype[name] = f;
        }
    }

};

const NOOP_STREAM = new NoopStream();

function PassStream(name) {

    this.name = name || '';
    this.next = NOOP_STREAM;

}

PassStream.prototype.handle = function passHandle(msg, source) {

    const n = this.name || source;
    this.next.handle(msg, n);

};

NOOP_STREAM.addStubs(PassStream);

function SubscribeSource(name, data, canPull){

    this.name = name;
    this.data = data;
    this.canPull = canPull;
    const stream = this.stream = new PassStream(name);
    this.callback = function(msg, source){ stream.handle(msg, source); };
    data.subscribe(this.callback);

}


SubscribeSource.prototype.pull = function pull(){

    !this.dead && this.canPull && this.emit();

};


SubscribeSource.prototype.emit = function emit(){

    const data = this.data;

    if(data.present) {
        const stream = this.stream;
        const msg = data.read();
        const source = this.name;
        stream.handle(msg, source);
    }

};


SubscribeSource.prototype.destroy = function destroy(){

    const callback = this.callback;

    this.data.unsubscribe(callback);
    this.dead = true;

};


NOOP_SOURCE.addStubs(SubscribeSource);

function EventSource(name, target, eventName, useCapture){

    function toStream(msg){
        stream.handle(msg, eventName, null);
    }

    this.name = name;
    this.target = target;
    this.eventName = eventName;
    this.useCapture = !!useCapture;
    this.on = target.addEventListener || target.addListener || target.on;
    this.off = target.removeEventListener || target.removeListener || target.off;
    this.stream = new PassStream(name);
    this.callback = toStream;
    const stream = this.stream;

    this.on.call(target, eventName, toStream, useCapture);

}



EventSource.prototype.destroy = function destroy(){

    this.off.call(this.target, this.eventName, this.callback, this.useCapture);
    this.dead = true;

};


NOOP_SOURCE.addStubs(EventSource);

function ForkStream(name, fork) {

    this.name = name;
    this.next = NOOP_STREAM;
    this.fork = fork;

}

ForkStream.prototype.handle = function handle(msg, source) {

    const n = this.name;
    this.next.handle(msg, n);
    this.fork.handle(msg, n);

};

ForkStream.prototype.reset = function reset(msg){

    this.next.reset(msg);
    this.fork.reset(msg);
};

NOOP_STREAM.addStubs(ForkStream);

function BatchStream(name) {

    this.name = name;
    this.next = NOOP_STREAM;
    this.msg = undefined;
    this.latched = false;

}

BatchStream.prototype.handle = function handle(msg, source) {

    this.msg = msg;

    if(!this.latched){
        this.latched = true;
        Catbus.enqueue(this);
    }

};

BatchStream.prototype.emit = function emit() { // called from enqueue scheduler

    const msg = this.msg;
    const source = this.name;

    this.latched = false; // can queue again
    this.next.handle(msg, source);



};


BatchStream.prototype.reset = function reset() {

    this.latched = false;
    this.msg = undefined;

    // doesn't continue on as in default

};

NOOP_STREAM.addStubs(BatchStream);

function ResetStream(name, head) {

    this.head = head; // stream at the head of the reset process
    this.name = name;
    this.next = NOOP_STREAM;

}

ResetStream.prototype.handle = function handle(msg, source) {

    this.next.handle(msg, source);
    this.head.reset(msg, source);

};

ResetStream.prototype.reset = function(){
    // catch reset from head, does not continue
};

function IDENTITY$1(d) { return d; }


function TapStream(name, f) {
    this.name = name;
    this.f = f || IDENTITY$1;
    this.next = NOOP_STREAM;
}

TapStream.prototype.handle = function handle(msg, source) {

    const n = this.name || source;
    const f = this.f;
    f(msg, n);
    this.next.handle(msg, n);

};

NOOP_STREAM.addStubs(TapStream);

function IDENTITY$2(msg, source) { return msg; }


function MsgStream(name, f, context) {

    this.name = name;
    this.f = f || IDENTITY$2;
    this.context = context;
    this.next = NOOP_STREAM;

}


MsgStream.prototype.handle = function msgHandle(msg, source) {

    const f = this.f;
    this.next.handle(f.call(this.context, msg, source), source);

};

NOOP_STREAM.addStubs(MsgStream);

function IDENTITY$3(d) { return d; }


function FilterStream(name, f, context) {

    this.name = name;
    this.f = f || IDENTITY$3;
    this.context = context || null;
    this.next = NOOP_STREAM;

}

FilterStream.prototype.handle = function filterHandle(msg, source) {

    const f = this.f;
    f.call(this.context, msg, source) && this.next.handle(msg, source);

};

NOOP_STREAM.addStubs(FilterStream);

function IS_PRIMITIVE_EQUAL(a, b) {
    return a === b && typeof a !== 'object' && typeof a !== 'function';
}


function SkipStream(name) {

    this.name = name;
    this.msg = undefined;
    this.hasValue = true;
    this.next = NOOP_STREAM;

}

SkipStream.prototype.handle = function handle(msg, source) {

    if(!this.hasValue) {

        this.hasValue = true;
        this.msg = msg;
        this.next.handle(msg, source);

    } else if (!IS_PRIMITIVE_EQUAL(this.msg, msg)) {

        this.msg = msg;
        this.next.handle(msg, source);

    }
};

NOOP_STREAM.addStubs(SkipStream);

function LastNStream(name, count) {

    this.name = name;
    this.count = count || 1;
    this.next = NOOP_STREAM;
    this.msg = [];

}

LastNStream.prototype.handle = function handle(msg, source) {

    const c = this.count;
    const m = this.msg;
    const n = this.name || source;

    m.push(msg);
    if(m.length > c)
        m.shift();

    this.next.handle(m, n);

};

LastNStream.prototype.reset = function(msg, source){

    this.msg = [];
    this.next.reset();

};

NOOP_STREAM.addStubs(LastNStream);

function FirstNStream(name, count) {

    this.name = name;
    this.count = count || 1;
    this.next = NOOP_STREAM;
    this.msg = [];

}

FirstNStream.prototype.handle = function handle(msg, source) {

    const c = this.count;
    const m = this.msg;
    const n = this.name || source;

    if(m.length < c)
        m.push(msg);

    this.next.handle(m, n);

};

FirstNStream.prototype.reset = function(msg, source){

    this.msg = [];

};

NOOP_STREAM.addStubs(FirstNStream);

function AllStream(name) {

    this.name = name;
    this.next = NOOP_STREAM;
    this.msg = [];

}

AllStream.prototype.handle = function handle(msg, source) {

    const m = this.msg;
    const n = this.name || source;

    m.push(msg);

    this.next.handle(m, n);

};

AllStream.prototype.reset = function(msg, source){

    this.msg = [];

};

NOOP_STREAM.addStubs(AllStream);

const FUNCTOR$1 = function(d) {
    return typeof d === 'function' ? d : function() { return d;};
};

function IMMEDIATE(msg, source) { return 0; }

function callback(stream, msg, source){
    const n = stream.name || source;
    stream.next.handle(msg, n);
}

function DelayStream(name, f) {

    this.name = name;
    this.f = arguments.length ? FUNCTOR$1(f) : IMMEDIATE;
    this.next = NOOP_STREAM;

}

DelayStream.prototype.handle = function handle(msg, source) {

    const delay = this.f(msg, source);
    setTimeout(callback, delay, this, msg, source);

};

NOOP_STREAM.addStubs(DelayStream);

function BY_SOURCE(msg, source) { return source; }

const FUNCTOR$2 = function(d) {
    return typeof d === 'function' ? d : function() { return d;};
};

function GroupStream(name, f, seed) {

    this.name = name;
    this.f = f || BY_SOURCE;
    this.seed = arguments.length === 3 ? FUNCTOR$2(seed) : FUNCTOR$2({});
    this.next = NOOP_STREAM;
    this.msg = this.seed();

}

GroupStream.prototype.handle = function handle(msg, source) {

    const f = this.f;
    const v = f(msg, source);
    const n = this.name || source;
    const m = this.msg;

    if(v){
        m[v] = msg;
    } else {
        for(const k in msg){
            m[k] = msg[k];
        }
    }

    this.next.handle(m, n);

};

GroupStream.prototype.reset = function reset(msg) {

    const m = this.msg = this.seed(msg);
    this.next.reset(m);

};

NOOP_STREAM.addStubs(GroupStream);

function TRUE$1() { return true; }


function LatchStream(name, f) {

    this.name = name;
    this.f = f || TRUE$1;
    this.next = NOOP_STREAM;
    this.latched = false;

}

LatchStream.prototype.handle = function handle(msg, source) {

    const n = this.name;

    if(this.latched){
        this.next.handle(msg, n);
        return;
    }

    const f = this.f;
    const v = f(msg, source);

    if(v) {
        this.latched = true;
        this.next.handle(msg, n);
    }

};

LatchStream.prototype.reset = function(seed){
    this.latched = false;
    this.next.reset(seed);
};

NOOP_STREAM.addStubs(LatchStream);

function ScanStream(name, f) {

    this.name = name;
    this.f = f;
    this.hasValue = false;
    this.next = NOOP_STREAM;
    this.value = undefined;

}


ScanStream.prototype.handle = function handle(msg, source) {

    const f = this.f;
    this.value = this.hasValue ? f(this.value, msg, source) : msg;
    this.next.handle(this.value, source);

};

ScanStream.prototype.reset = function reset() {

    this.hasValue = false;
    this.value = undefined;
    this.next.reset();

};

NOOP_STREAM.addStubs(ScanStream);

const FUNCTOR$3 = function(d) {
    return typeof d === 'function' ? d : function() { return d;};
};

function ScanWithSeedStream(name, f, seed) {

    this.name = name;
    this.f = f;
    this.seed = FUNCTOR$3(seed);
    this.next = NOOP_STREAM;
    this.value = this.seed();

}



ScanWithSeedStream.prototype.handle = function scanWithSeedHandle(msg, source) {

    const f = this.f;
    this.value = f(this.value, msg, source);
    this.next.handle(this.value, source);

};

ScanWithSeedStream.prototype.reset = function reset(msg) {

    this.value = this.seed(msg);
    this.next.reset(this.value);

};

NOOP_STREAM.addStubs(ScanWithSeedStream);




// const scanStreamBuilder = function(f, seed) {
//     const hasSeed = arguments.length === 2;
//     return function(name) {
//         return hasSeed? new ScanWithSeedStream(name, f, seed) : new ScanStream(name, f);
//     }
// };

function SplitStream(name) {

    this.name = name;
    this.next = NOOP_STREAM;

}


SplitStream.prototype.handle = function splitHandle(msg, source) {

    if(Array.isArray(msg)){
        this.withArray(msg, source);
    } else {
        this.withIteration(msg, source);
    }

};


SplitStream.prototype.withArray = function(msg, source){

    const len = msg.length;

    for(let i = 0; i < len; ++i){
        this.next.handle(msg[i], source);
    }

};



SplitStream.prototype.withIteration = function(msg, source){

    const next = this.next;

    for(const m of msg){
        next.handle(m, source);
    }

};

NOOP_STREAM.addStubs(SplitStream);

function WriteStream(name, data) {
    this.name = name;
    this.data = data;
    this.next = NOOP_STREAM;
}

WriteStream.prototype.handle = function handle(msg, source) {

    this.data.write(msg);
    this.next.handle(msg, source);

};

NOOP_STREAM.addStubs(WriteStream);

function IDENTITY$4(d) { return d; }


function FilterMapStream(name, f, m, context) {

    this.name = name || '';
    this.f = f || IDENTITY$4;
    this.m = m || IDENTITY$4;
    this.context = context || null;
    this.next = NOOP_STREAM;

}

FilterMapStream.prototype.handle = function filterHandle(msg, source) {

    const f = this.f;
    const m = this.m;
    f.call(this.context, msg, source) && this.next.handle(
        m.call(this.context, msg, source));

};

NOOP_STREAM.addStubs(FilterMapStream);

function PriorStream(name) {

    this.name = name;
    this.values = [];
    this.next = NOOP_STREAM;

}

PriorStream.prototype.handle = function handle(msg, source) {

    const arr = this.values;

    arr.push(msg);

    if(arr.length === 1)
        return;

    if(arr.length > 2)
        arr.shift();

    this.next.handle(arr[0], source);

};

PriorStream.prototype.reset = function(msg, source){

    this.msg = [];
    this.next.reset();

};

NOOP_STREAM.addStubs(PriorStream);

function FUNCTOR$4(d) {
    return typeof d === 'function' ? d : function() { return d; };
}

function ReduceStream(name, f, seed) {

    this.name = name;
    this.seed = FUNCTOR$4(seed);
    this.v = this.seed() || 0;
    this.f = f;
    this.next = NOOP_STREAM;

}


ReduceStream.prototype.reset = function(){

    this.v = this.seed() || 0;
    this.next.reset();

};

ReduceStream.prototype.handle = function(msg, source){

    const f = this.f;
    this.next.handle(this.v = f(msg, this.v), source);

};

NOOP_STREAM.addStubs(ReduceStream);

function SkipNStream(name, count) {

    this.name = name;
    this.count = count || 0;
    this.next = NOOP_STREAM;
    this.seen = 0;

}

SkipNStream.prototype.handle = function handle(msg, source) {

    const c = this.count;
    const s = this.seen;

    if(this.seen < c){
        this.seen = s + 1;
    } else {
        this.next.handle(msg, source);
    }

};

SkipNStream.prototype.reset = function(){

    this.seen = 0;

};

NOOP_STREAM.addStubs(SkipNStream);

function TakeNStream(name, count) {

    this.name = name;
    this.count = count || 0;
    this.next = NOOP_STREAM;
    this.seen = 0;

}

TakeNStream.prototype.handle = function handle(msg, source) {

    const c = this.count;
    const s = this.seen;

    if(this.seen < c){
        this.seen = s + 1;
        this.next.handle(msg, source);
    }

};

TakeNStream.prototype.reset = function(){

    this.seen = 0;

};

NOOP_STREAM.addStubs(TakeNStream);

function Spork(bus) {

    this.bus = bus;
    this.streams = [];
    this.first = NOOP_STREAM;
    this.last = NOOP_STREAM;
    this.initialized = false;

}

Spork.prototype.handle = function(msg, source) {

    this.first.reset();
    this._split(msg, source);
    this.last.handle(this.last.v, source);

};


Spork.prototype.withArray = function withArray(msg, source){

    const len = msg.length;

    for(let i = 0; i < len; ++i){
        this.first.handle(msg[i], source);
    }

};

Spork.prototype.withIteration = function withIteration(msg, source){

    const first = this.first;
    for(const i of msg){
        first.handle(i, source);
    }

};

Spork.prototype._split = function(msg, source){

    if(Array.isArray(msg)){
        this.withArray(msg, source);
    } else {
        this.withIteration(msg, source);
    }

};

Spork.prototype._extend = function(stream) {

    if(!this.initialized){
        this.initialized = true;
        this.first = stream;
        this.last = stream;
    } else {
        this.streams.push(stream);
        this.last.next = stream;
        this.last = stream;
    }

};

Spork.prototype.msg = function msg(f) {
    this._extend(new MsgStream('', f));
    return this;
};

Spork.prototype.skipDupes = function skipDupes() {
    this._extend(new SkipStream(''));
    return this;
};

Spork.prototype.skip = function skip(n) {
    this._extend(new SkipNStream('', n));
    return this;
};

Spork.prototype.take = function take(n) {
    this._extend(new TakeNStream('', n));
    return this;
};


Spork.prototype.reduce = function reduce(f, seed) {
    this._extend(new ReduceStream('', f, seed));
    this.bus._spork = null;
    return this.bus;
};

Spork.prototype.filter = function filter(f) {
    this._extend(new FilterStream('', f));
    return this;
};

Spork.prototype.filterMap = function filterMap(f, m) {
    this._extend(new FilterMapStream('', f, m));
    return this;
};

class Frame {

    constructor(bus) {

        this.bus = bus;
        this.index = bus._frames.length;
        this.streams = [];

    };


}

const MeowParser = {};

const phraseCmds = {

    '&': {name: 'AND_READ', react: false, process: true, output: false, can_maybe: true, can_alias: true, can_prop: true},
    '>': {name: 'WRITE', react: false, process: true, output: true, can_maybe: true, can_alias: true, can_prop: true},
    '|': {name: 'THEN_READ', react: false, process: true, output: false, can_maybe: true, can_alias: true, can_prop: true},
    '@': {name: 'EVENT', react: true, process: false, output: false, can_maybe: true, can_alias: true, can_prop: true},
    '~': {name: 'WATCH_TOGETHER', react: true, process: false, output: false, can_maybe: true, can_alias: true, can_prop: true},
    '#': {name: 'HOOK', react: false, process: true, output: true, can_maybe: false, can_alias: false, can_prop: false},
    '*': {name: 'METHOD', react: false, process: true, output: true, can_maybe: false, can_alias: false, can_prop: false},
    '%': {name: 'FILTER', react: false, process: true, output: false, can_maybe: false, can_alias: false, can_prop: false},
    '{': {name: 'WATCH_EACH', react: true, process: false, output: false, can_maybe: true, can_alias: true, can_prop: true},

};

const wordModifiers = {

    ':': 'ALIAS',
    '?': 'MAYBE',
    '.': 'PROP'

};

function Phrase(cmd, content){

    this.content = content;
    this.cmd = cmd;
    this.words = [];

    if(cmd.name === 'HOOK')
        parseHook(this);
    else
        parseWords(this);

}

function Word(content){

    this.content = content;
    this.name = '';
    this.alias = '';
    this.maybe = false;
    this.args = [];

    parseSyllables(this);

}

function parseHook(phrase){

    const chunks = splitHookDelimiters(phrase.content);
    while(chunks.length) {

        const content = chunks.shift();
        const word = new Word(content);
        phrase.words.push(word);

    }

}


function parseWords(phrase){

    const chunks = splitWordDelimiters(phrase.content);
    while(chunks.length) {

        const content = chunks.shift();
        const word = new Word(content);
        phrase.words.push(word);

    }

}

function parseSyllables(word){

    const chunks = splitSyllableDelimiters(word.content);

    let arg = null;

    while(chunks.length) {

        const syllable = chunks.shift();
        const modifier = wordModifiers[syllable];

        if(!modifier && !arg){
            arg = {name: syllable, maybe: false};
        } else if(modifier === 'ALIAS' && chunks.length) {
            word.alias = chunks.shift();
            break;
        } else if(modifier === 'PROP' && chunks.length){
            if(arg)
                word.args.push(arg);
            arg = null;
        } else if(modifier === 'MAYBE' && arg){
            arg.maybe = true;
            word.args.push(arg);
            arg = null;
        }

    }

    if(arg)
        word.args.push(arg);

    // word name is first arg collected
    if(word.args.length){
        const firstArg = word.args.shift();
        word.name = firstArg.name;
        word.maybe = firstArg.maybe;
    }

    // default to last extracted property as alias if not specified
    if(word.args.length && !word.alias){
        const lastArg = word.args[word.args.length - 1];
        word.alias = lastArg.name;
    }

    word.alias = word.alias || word.name;


}

function parse(text){


    const phrases = [];
    const chunks = splitPhraseDelimiters(text);

    while(chunks.length){

        let chunk = chunks.shift();
        let cmd = phraseCmds[chunk];
        let content;

        if(!cmd && !phrases.length) { // default first cmd is WATCH_TOGETHER
            cmd = phraseCmds['~'];
            content = !phraseCmds[chunk] && chunk;
        } else if(cmd && chunks.length) {
            content = chunks.shift();
            content = !phraseCmds[content] && content;
        } else {
            // error, null content
        }

        const phrase = new Phrase(cmd, content);
        phrases.push(phrase);


    }

    return phrases;

}




function filterEmptyStrings(arr){

    let result = [];

    for(let i = 0; i < arr.length; i++){
        const c = arr[i].trim();
        if(c)
            result.push(c);
    }

    return result;

}


function splitPhraseDelimiters(text){

    let chunks = text.split(/([&>|@~*%#{])/);
    return filterEmptyStrings(chunks);

}

function splitWordDelimiters(text){

    let chunks = text.split(',');
    return filterEmptyStrings(chunks);

}

function splitHookDelimiters(text){

    let chunks = text.split(' ');
    return filterEmptyStrings(chunks);

}

function splitSyllableDelimiters(text){

    let chunks = text.split(/([:?.])/);
    return filterEmptyStrings(chunks);

}



MeowParser.parse = parse;

function runMeow(bus, meow){

    const phrases = Array.isArray(meow) ? meow : MeowParser.parse(meow);
    for(let i = 0; i < phrases.length; i++){
        const phrase = phrases[i];
        runPhrase(bus, phrase);
    }

}

function runPhrase(bus, phrase){

    const name = phrase.cmd.name;
    const scope = bus.scope;
    const words = phrase.words;
    const context = bus.context();
    const target = bus.target();
    const multiple = words.length > 1;

    if(name === 'THEN_READ'){
        if(multiple){
            bus.msg(getThenReadMultiple(scope, words));
        } else {
            const word = words[0];
            bus.msg(getThenReadOne(scope, word).read);
            bus.source(word.alias);
        }
    } else if(name === 'AND_READ'){
        bus.msg(getThenReadMultiple(scope, words, true));
    } else if(name === 'METHOD'){
        for(let i = 0; i < words.length; i++) {
            const word = words[i];
            const method = context[word.name];
            bus.msg(method, context);
        }
    } else if(name === 'FILTER'){
        for(let i = 0; i < words.length; i++) {
            const word = words[i];
            const method = context[word.name];
            bus.filter(method, context);
        }
    } else if(name === 'EVENT'){
        watchEvents(bus, words);
    } else if(name === 'WATCH_EACH'){
        watchWords(bus, words);
    } else if(name === 'WATCH_TOGETHER'){
        watchWords(bus, words);
        if(multiple)
            bus.merge().group();
        bus.batch();
        if(multiple)
            bus.hasKeys(toAliasList(words));
    } else if(name === 'WRITE'){
        if(multiple) {
            // todo transaction, no actions
        } else {
            const word = words[0];
            const data = scope.find(word.name);
            bus.write(data);
        }
    }

}

// todo throw errors
function extractProperties(word, value){

    let maybe = word.maybe;
    let args = word.args;

    for(let i = 0; i < args.length; i++){
        const arg = args[i];
        if(!value && maybe)
            return value;
        value = value[arg.name];
        maybe = arg.maybe;
    }

    return value;

}

function toAliasList(words){

    const list = [];
    for(let i = 0; i < words.length; i++) {
        const word = words[i];
        list.push(word.alias);
    }
    return list;

}

function watchWords(bus, words){

    const scope = bus.scope;

    for(let i = 0; i < words.length; i++) {

        const word = words[i];
        const watcher = createWatcher(scope, word);
        bus.add(watcher);

    }

}

function createWatcher(scope, word){

    const watcher = scope.bus();
    const data = scope.find(word.name);

    watcher.addSubscribe(word.alias, data);

    if(word.args.length) {
        watcher.msg(function (msg) {
            return extractProperties(word, msg);
        });
    }

    if(!isAction(word.name)){
        watcher.skipDupes();
    }

    return watcher;

}

function watchEvents(bus, words){

    const scope = bus.scope;
    const target = bus.target();

    for(let i = 0; i < words.length; i++) { // todo add capture to words

        const word = words[i];
        const eventBus = createEventBus(scope, target, word);
        bus.add(eventBus);

    }

}


function createEventBus(scope, target, word){

    const eventBus = scope.bus();

    eventBus.addEvent(word.alias, target, word.name);

    if(word.args.length) {
        eventBus.msg(function (msg) {
            return extractProperties(word, msg);
        });
    }

    return eventBus;

}

// function getWriteTransaction(scope, words){
//
//     const writeSourceNames = [];
//     const writeTargetNames = [];
//     const targetsByName = {};
//
//     for(let i = 0; i < words.length; i++){
//         const word = words[i];
//         const sourceName = word.name;
//         const targetName = word.alias;
//         const target = scope.find()
//     }
//
//     return function writeTransaction(msg, source){
//
//         for(let i = 0; i < words.length; i++){
//
//         }
//
//     };
//
//
//
//     return reader;
//
// }


function getThenReadOne(scope, word){

    const state = scope.find(word.name);
    const reader = {};

    reader.read = function read(){
        const value = state.read();
        return extractProperties(word, value);
    };

    reader.present = function present(){
        return state.present;
    };

    return reader;

}

function getThenReadMultiple(scope, words, usingAnd){

    const readers = [];
    for(let i = 0; i < words.length; i++){
        const word = words[i];
        readers.push(getThenReadOne(scope, word));
    }

    return function thenReadMultiple(msg, source){

        const result = {};

        if(usingAnd) {
            if (source) {
                result[source] = msg;
            } else {
                for (const p in msg) {
                    result[p] = msg[p];
                }
            }
        }

        for(let i = 0; i < words.length; i++){
            const word = words[i];
            const prop = word.alias;
            const reader = readers[i];
            if(reader.present())
                result[prop] = reader.read();
        }

        return result;
    }

}



const MeowRunner = {
    runMeow: runMeow,
};

const FUNCTOR = function(d) {
    return typeof d === 'function' ? d : function() { return d;};
};

const batchStreamBuilder = function() {
    return function(name) {
        return new BatchStream(name);
    }
};

const resetStreamBuilder = function(head) {
    return function(name) {
        return new ResetStream(name, head);
    }
};

const tapStreamBuilder = function(f) {
    return function(name) {
        return new TapStream(name, f);
    }
};

const msgStreamBuilder = function(f, context) {
    return function(name) {
        return new MsgStream(name, f, context);
    }
};

const filterStreamBuilder = function(f, context) {
    return function(name) {
        return new FilterStream(name, f, context);
    }
};

const skipStreamBuilder = function(f) {
    return function(name) {
        return new SkipStream(name, f);
    }
};

const lastNStreamBuilder = function(count) {
    return function(name) {
        return new LastNStream(name, count);
    }
};

const priorStreamBuilder = function() {
    return function(name) {
        return new PriorStream(name);
    }
};

const firstNStreamBuilder = function(count) {
    return function(name) {
        return new FirstNStream(name, count);
    }
};

const allStreamBuilder = function() {
    return function(name) {
        return new AllStream(name);
    }
};

const delayStreamBuilder = function(delay) {
    return function(name) {
        return new DelayStream(name, delay);
    }
};

const groupStreamBuilder = function(by) {
    return function(name) {
        return new GroupStream(name, by);
    }
};

const nameStreamBuilder = function(name) {
    return function() {
        return new PassStream(name);
    }
};

const latchStreamBuilder = function(f) {
    return function(name) {
        return new LatchStream(name, f);
    }
};

const scanStreamBuilder = function(f, seed) {
    const hasSeed = arguments.length === 2;
    return function(name) {
        return hasSeed ?
            new ScanWithSeedStream(name, f, seed) : new ScanStream(name, f);
    }
};

const splitStreamBuilder = function() {
    return function(name) {
        return new SplitStream(name);
    }
};

const writeStreamBuilder = function(data) {
    return function(name) {
        return new WriteStream(name, data);
    }
};

const filterMapStreamBuilder = function(f, m, context) {
    return function(name) {
        return new FilterMapStream(name, f, m, context);
    }
};

function getHasKeys(keys){

    const len = keys.length;
    return function _hasKeys(msg, source){

        if(typeof msg !== 'object')
            return false;

        for(let i = 0; i < len; i++){
            const k = keys[i];
            if(!msg.hasOwnProperty(k))
                return false;
        }

        return true;
    }

}

class Bus {

    // todo buses can't be added to each other cyclically
    // each bus gets one source, then children pull

    constructor(scope) {

        this._frames = [];
        this._sources = [];
        this._dead = false;
        this._scope = scope;
        this._children = []; // from forks
        this._parent = null;
        this._context = null; // for methods
        this._target = null; // e.g. dom node for events, styles, etc.

        // temporary api states (used for interactively building the bus)

        this._spork = null; // beginning frame of split sub process
        this._holding = false; // multiple commands until duration function
        this._head = null; // point to reset accumulators
        this._locked = false; // prevents additional sources from being added

        if(scope)
            scope._buses.push(this);

        const f = new Frame(this);
        this._frames.push(f);
        this._currentFrame = f;

    };



    get children(){

        return this._children.map((d) => d);

    };

    get parent() { return this._parent; };

    set parent(newParent){

        const oldParent = this.parent;

        if(oldParent === newParent)
            return;

        if(oldParent) {
            const i = oldParent._children.indexOf(this);
            oldParent._children.splice(i, 1);
        }

        this._parent = newParent;

        if(newParent) {
            newParent._children.push(this);
        }

        return this;

    };

    get dead() {
        return this._dead;
    };

    get holding() {
        return this._holding;
    };

    get scope() {
        return this._scope;
    }

    _createMergingFrame() {

        const f1 = this._currentFrame;
        const f2 = this._currentFrame = new Frame(this);
        this._frames.push(f2);

        const source_streams = f1.streams;
        const target_streams = f2.streams;
        const merged_stream = new PassStream();
        target_streams.push(merged_stream);

        const len = source_streams.length;
        for(let i = 0; i < len; i++){
            const s1 = source_streams[i];
            s1.next = merged_stream;
        }

        return f2;

    };

    _createNormalFrame(streamBuilder) {

        const f1 = this._currentFrame;
        const f2 = this._currentFrame = new Frame(this);
        this._frames.push(f2);

        const source_streams = f1.streams;
        const target_streams = f2.streams;

        const len = source_streams.length;
        for(let i = 0; i < len; i++){
            const s1 = source_streams[i];
            const s2 = streamBuilder ? streamBuilder(s1.name) : new PassStream(s1.name);
            s1.next = s2;
            target_streams.push(s2);
        }

        return f2;

    };


    _createForkingFrame(forkedTargetFrame) {

        const f1 = this._currentFrame;
        const f2 = this._currentFrame = new Frame(this);
        this._frames.push(f2);

        const source_streams = f1.streams;
        const target_streams = f2.streams;
        const forked_streams = forkedTargetFrame.streams;

        const len = source_streams.length;
        for(let i = 0; i < len; i++){

            const s1 = source_streams[i];
            const s3 = new PassStream(s1.name);
            const s2 = new ForkStream(s1.name, s3);

            s1.next = s2;

            target_streams.push(s2);
            forked_streams.push(s3);
        }

        return f2;

    };

    _ASSERT_IS_FUNCTION(f) {
        if(typeof f !== 'function')
            throw new Error('Argument must be a function.');
    };

    _ASSERT_NOT_HOLDING() {
        if (this.holding)
            throw new Error('Method cannot be invoked while holding messages in the frame.');
    };

    _ASSERT_IS_HOLDING(){
        if(!this.holding)
            throw new Error('Method cannot be invoked unless holding messages in the frame.');
    };

    _ASSERT_HAS_HEAD(){
        if(!this._head)
            throw new Error('Cannot reset without an upstream accumulator.');
    };

    _ASSERT_NOT_LOCKED(){
        if(this._locked)
            throw new Error('Cannot add sources after other operations.');
    };

    _ASSERT_NOT_SPORKING(){
        if(this._spork)
            throw new Error('Cannot do this while sporking.');
    };


    addSource(source){

        this._ASSERT_NOT_LOCKED();

        this._sources.push(source);
        this._currentFrame.streams.push(source.stream);
        return this;

    }

    meow(str){ // meow string -- or accept meow array if parsed earlier

        MeowRunner.runMeow(this, str);
        return this;

    }

    process(meow){

        return this.meow(meow);
    }


    fork() {

        this._ASSERT_NOT_HOLDING();
        const fork = new Bus(this.scope);
        fork.parent = this;
        this._createForkingFrame(fork._currentFrame);

        return fork;
    };

    back() {

        if(!this._parent)
            throw new Error('Cannot exit fork, parent does not exist!');

        return this.parent;

    };

    fuse(bus) {

        this.add(bus);
        this.merge();
        this.group();

        return this;
    };

    join() {

        const parent = this.back();
        parent.add(this);
        return parent;

    };

    add(bus) {

        this._children.push(bus);
        const nf = this._createNormalFrame(); // extend this bus
        bus._createForkingFrame(nf); // outside bus then forks into this bus
        return this;

    };

    fromMany(buses) {

        const nf = this._createNormalFrame(); // extend this bus

        const len = buses.length;
        for(let i = 0; i < len; i++) {
            const bus = buses[i];
            bus._createForkingFrame(nf); // outside bus then forks into this bus
            // add sources from buses
            // bus._createTerminalFrame
        }

        return this;

    };

    addMany(buses) {

        const nf = this._createNormalFrame(); // extend this bus

        const len = buses.length;
        for(let i = 0; i < len; i++) {
            const bus = buses[i];
            bus._createForkingFrame(nf); // outside bus then forks into this bus
        }
        return this;

    };

    spork() {

        this._ASSERT_NOT_HOLDING();
        this._ASSERT_NOT_SPORKING();

        const spork = new Spork(this);

        function sporkBuilder(){
            return spork;
        }

        this._createNormalFrame(sporkBuilder);
        return this._spork = spork;

    };

    // defer() {
    //     return this.timer(F.getDeferTimer);
    // };


    context(obj){
        if(arguments.length){
            this._context = obj;
            return this;
        }
        return this._context;
    }

    target(obj){
        if(arguments.length){
            this._target = obj;
            return this;
        }
        return this._target;
    }

    batch() {
        this._createNormalFrame(batchStreamBuilder());
        this._holding = false;
        return this;
    };


    // throttle(fNum) {
    //     return this.timer(F.getThrottleTimer, fNum);
    // };

    hold() {

        this._ASSERT_NOT_HOLDING();
        this._holding = true;
        this._head = this._createNormalFrame();
        return this;

    };

    reset() {

        this._ASSERT_HAS_HEAD();
        this._createNormalFrame(resetStreamBuilder(this._head));
        return this;

    }

    pull() {

        const len = this._sources.length;

        for(let i = 0; i < len; i++) {
            const s = this._sources[i];
            s.pull();
        }

        for(let i = 0; i < this._children.length; i++) {
            const c = this._children[i];
            c.pull();
        }

        return this;

    };




    scan(f, seed){

        this._createNormalFrame(scanStreamBuilder(f, seed));
        return this;

    };



    delay(fNum) {

        this._createNormalFrame(delayStreamBuilder(fNum));
        return this;

    };



    hasKeys(keys) {

        const f = getHasKeys(keys);
        this._createNormalFrame(latchStreamBuilder(f));
        return this;

    };

    group(by) {

        this._createNormalFrame(groupStreamBuilder(by));
        return this;

    };

    all() {
        this._createNormalFrame(allStreamBuilder());
        return this;
    };

    first(count) {
        this._createNormalFrame(firstNStreamBuilder(count));
        return this;
    };

    last(count) {
        this._createNormalFrame(lastNStreamBuilder(count));
        return this;
    };


    prior() {

        this._createNormalFrame(priorStreamBuilder());
        return this;

    };

    run(f) {

        this._ASSERT_IS_FUNCTION(f);

        this._createNormalFrame(tapStreamBuilder(f));
        return this;

    };

    merge() {

        this._createMergingFrame();
        return this;

    };

    msg(fAny, context) {

        const f = FUNCTOR(fAny);

        this._createNormalFrame(msgStreamBuilder(f, context));
        return this;


    };

    name(str) {

        this._createNormalFrame(nameStreamBuilder(str));
        return this;

    };

    source(str) {

        this._createNormalFrame(nameStreamBuilder(str));
        return this;

    };

    write(data) {

        this._createNormalFrame(writeStreamBuilder(data));
        return this;

    };

    filter(f, context) {

        this._ASSERT_IS_FUNCTION(f);
        this._ASSERT_NOT_HOLDING();

        this._createNormalFrame(filterStreamBuilder(f, context));
        return this;


    };

    filterMap(f, m) {

        this._ASSERT_IS_FUNCTION(f);
        this._ASSERT_NOT_HOLDING();

        this._createNormalFrame(filterMapStreamBuilder(f, m));
        return this;


    };

    split() {

        this._createNormalFrame(splitStreamBuilder());
        return this;

    };

    skipDupes() {

        this._createNormalFrame(skipStreamBuilder());
        return this;

    };

    addSubscribe(name, data){

        const source = new SubscribeSource(name, data, true);
        this.addSource(source);

        return this;

    };

    addEvent(name, target, eventName, useCapture){

        const source = new EventSource(name, target, eventName || name, useCapture);
        this.addSource(source);

        return this;

    };

    toStream() {
        // merge, fork -> immutable stream?
    };

    destroy() {

        if (this.dead)
            return this;

        this._dead = true;

        const sources = this._sources;
        const len = sources.length;

        for (let i = 0; i < len; i++) {
            const s = sources[i];
            s.destroy();
        }

        return this;

    };

}

let idCounter = 0;

function _destroyEach(arr){

    let i = arr.length;
    while(i--){
        arr[i].destroy();
    }

}

class Scope{

    constructor(name) {

        this._id = ++idCounter;
        this._name = name;
        this._parent = null;
        this._children = [];
        this._wires = {};
        this._buses = [];
        this._dataMap = new Map();
        this._valveMap = new Map();
        this._mirrorMap = new Map();
        this._dead = false;
        this._shared = false; // shared scopes can access private actions and states in their parent

    };

    get name() { return this._name; };
    get dead() { return this._dead; };

    get children(){

        return this._children.map((d) => d);

    };

    bus(){

        return new Bus(this);

    };


    clear(){

        if(this._dead)
            return;

        _destroyEach(this.children);
        _destroyEach(this._buses);
        _destroyEach(this._dataMap.values());

        this._children = [];
        this._buses = [];
        this._dataMap.clear();
        this._valveMap.clear();
        this._mirrorMap.clear();

    };

    destroy(){

        this.clear();
        this.parent = null;
        this._dead = true;

    };

    createChild(name){

        let child = new Scope(name);
        child.parent = this;
        return child;

    };

    insertParent(newParent){

        newParent.parent = this.parent;
        this.parent = newParent;
        return this;

    };

    get parent() { return this._parent; };

    set parent(newParent){

        const oldParent = this.parent;

        if(oldParent === newParent)
            return;

        if(oldParent) {
            const i = oldParent._children.indexOf(this);
            oldParent._children.splice(i, 1);
        }

        this._parent = newParent;

        if(newParent) {
            newParent._children.push(this);
        }

        return this;

    };

    set valves(list){

        for(const name of list){
            this._valveMap.set(name, true);
        }

    }

    get valves(){ return Array.from(this._valveMap.keys());};


    _createMirror(data){

        const mirror = Object.create(data);
        mirror._writable = false;
        this._mirrorMap.set(data.name, mirror);
        return mirror;

    };

    _createData(name){

        const d = new Data(this, name);
        this._dataMap.set(name, d);
        if(!d._action && !d._private) // if a public state, create a read-only mirror
            this._createMirror(d);
        return d;

    };

    demand(name){

        return this.grab(name) || this._createData(name);

    };


    wire(stateName){

        const actionName = '$' + stateName;
        const state = this.demand(stateName);
        const action = this.demand(actionName);

        if(!this._wires[stateName]) {
            this._wires[stateName] = this.bus().meow(actionName + ' > ' + stateName);
        }

        return state;

    };


    findDataSet(names, required){


        const result = {};
        for(const name of names){
            result[name] = this.find(name, required);
        }

        return result;

    };

    readDataSet(names, required){

        const dataSet = this.findDataSet(names, required);
        const result = {};

        for(const d of dataSet) {
            if (d) {

                if (d.present)
                    result[d.name] = d.read();
            }
        }

        return result;
    };


    // created a flattened view of all data at and above this scope

    flatten(){

        let scope = this;

        const result = new Map();
        const appliedValves = new Map();

        for(const [key, value] of scope._dataMap){
            result.set(key, value);
        }

        while(scope = scope._parent){

            const dataList = scope._dataMap;
            const valves = scope._valveMap;
            const mirrors = scope._mirrorMap;

            if(!dataList.size)
                continue;

            // further restrict valves with each new scope

            if(valves.size){
                if(appliedValves.size) {
                    for (const key of appliedValves.keys()) {
                        if(!valves.has(key))
                            appliedValves.delete(key);
                    }
                } else {
                    for (const [key, value] of valves.entries()) {
                        appliedValves.set(key, value);
                    }
                }
            }

            const possibles = appliedValves.size ? appliedValves : dataList;

            for(const key of possibles.keys()) {
                if (!result.has(key)) {

                    const data = mirrors.get(key) || dataList.get(key);
                    if (data)
                        result.set(key, data);
                }
            }

        }

        return result;

    };


    find(name, required){

        const localData = this.grab(name);

        if(localData)
            return localData;

        // if(this.shared){
        //     const sharedData = this._parent.grab(name);
        //     if(sharedData)
        //         return sharedData;
        // }

        let scope = this;

        while(scope = scope._parent){

            const valves = scope._valveMap;

            // if valves exist and the name is not present, stop looking
            if(valves.size && !valves.has(name)){
                break;
            }

            const mirror = scope._mirrorMap.get(name);

            if(mirror)
                return mirror;

            const d = scope.grab(name);

            if(d) {
                if (d._private)
                    continue;
                return d;
            }

        }

        _ASSERT_NOT_REQUIRED(required);

        return null;

    };


    findOuter(name, required){

        _ASSERT_NO_OUTER_PRIVATE(name);

        let foundInner = false;
        const localData = this.grab(name);

        if(localData)
            foundInner = true;

        let scope = this;

        while(scope = scope._parent){

            const valves = scope._valveMap;

            // if valves exist and the name is not present, stop looking
            if(valves.size && !valves.has(name)){
                break;
            }

            const mirror = scope._mirrorMap.get(name);

            if(mirror) {

                if(foundInner)
                    return mirror;

                foundInner = true;
                continue;
            }

            const d = scope.grab(name);

            if(d) {

                if(foundInner)
                    return d;

                foundInner = true;
            }

        }

        if(required)
            throw new Error('Required data: ' + name + ' not found!');

        return null;

    };

    grab(name, required) {

        const data = this._dataMap.get(name);

        if(!data && required)
            throw new Error('Required Data: ' + name + ' not found!');

        return data || null;

    };


    // write key-values as a transaction
    write(writeHash){

        const list = [];

        for(const k in writeHash){
            const v = writeHash[k];
            const d = this.find(k);
            // todo ASSERT_DATA_FOUND
            d.silentWrite(v);
            list.push(d);
        }

        for(const d of list){
            d.refresh();
        }

        return this;

    };

}

function _ASSERT_NOT_REQUIRED(required){
    if(required)
        throw new Error('Required data: ' + name + ' not found!');
}

function _ASSERT_NO_OUTER_PRIVATE(name){
    if(isPrivate(name))
        throw new Error('Private data: ' + name + ' cannot be accessed via an outer scope!');
}

const FUNCTOR$5 = function(d) {
    return typeof d === 'function' ? d : function() { return d;};
};

function callback$1(source){

    const n = source.name;
    const msg = source.msg();
    source.stream.handle(msg, n, null);

}

function IntervalSource(name, delay, msg) {

    this.name = name;
    this.delay = delay;
    this.dead = false;
    this.stream = new PassStream(name);
    this.intervalId = setInterval(callback$1, delay, this);
    this.msg = FUNCTOR$5(msg);

}

IntervalSource.prototype.destroy = function destroy(){
    clearInterval(this.intervalId);
    this.dead = true;
};


NOOP_SOURCE.addStubs(IntervalSource);

function ValueSource(name, value){

    this.name = name;
    this.value = value;
    this.stream = new PassStream(name);

}

function tryEmit(source){
    try{
        source.emit();
    } catch(e){
    }
}

ValueSource.prototype.pull = function pull(){

    tryEmit(this);

};

ValueSource.prototype.emit = function pull(){

    this.stream.handle(this.value, this.name, '');

};

NOOP_SOURCE.addStubs(ValueSource);

function ArraySource(name, value){

    this.name = name;
    this.value = value;
    this.stream = new PassStream(name);

}

ArraySource.prototype.pull = function pull(){

    push(this.stream, this.value, this.value.length, this.name);

};

function push(stream, arr, len, name){
    for(let i = 0; i < len; ++i) {
        stream.handle(arr[i], name, '');
    }
}


NOOP_SOURCE.addStubs(ArraySource);

const Catbus = {};

let _batchQueue = [];
let _primed = false;

Catbus.bus = function(){
    return new Bus();
};

Catbus.meow = MeowParser.parse;

Catbus.fromInterval = function(name, delay, msg){

    const bus = new Bus();
    const source = new IntervalSource(name, delay, msg);
    bus.addSource(source);

    return bus;

};

Catbus.fromEvent = function(target, eventName, useCapture){

    const bus = new Bus();
    const source = new EventSource(eventName, target, eventName, useCapture);
    bus.addSource(source);

    return bus;

};

Catbus.fromValues = function(values){

    const bus = new Bus();
    const len = values.length;
    for(let i = 0; i < len; ++i) {
        const source = new ValueSource('', value);
        bus.addSource(source);
    }
    return bus;

};

Catbus.fromArray = function(arr, name){

    return Catbus.fromValue(arr, name).split();

};

Catbus.fromValue = function(value, name){

    const bus = new Bus();
    const source = new ValueSource(name || '', value);
    bus.addSource(source);

    return bus;

};


Catbus.fromSubscribe = function(name, data){

    const bus = new Bus();
    const source = new SubscribeSource(name, data, true);
    bus.addSource(source);

    return bus;

};


// todo stable output queue -- output pools go in a queue that runs after the batch q is cleared, thus run once only

Catbus.enqueue = function(pool){

    _batchQueue.push(pool);

    if(!_primed) { // register to flush the queue
        _primed = true;
        if (typeof window !== 'undefined' && window.requestAnimationFrame) requestAnimationFrame(Catbus.flush);
        else process.nextTick(Catbus.flush);
    }

};


Catbus.createChild = Catbus.scope = function(name){

    return new Scope(name);

};


Catbus.flush = function(){

    _primed = false;

    let cycles = 0;
    let q = _batchQueue;
    _batchQueue = [];

    while(q.length) {

        while (q.length) {
            const pool = q.shift();
            pool.emit();
        }

        q = _batchQueue;
        _batchQueue = [];

        cycles++;
        if(cycles > 10)
            throw new Error('Flush batch cycling loop > 10.', q);

    }

};

// the PathResolver is a namespace that uses a browser hack to generate an
// absolute path from a url string -- using an anchor tag's href.
// it combines the aliasMap with a url and possible root directory.


const PathResolver = {};
const ANCHOR = document.createElement('a');


PathResolver.resolveUrl = function resolveUrl(aliasMap, url, root) {

    url = aliasMap ? (aliasMap[url] || url) : url;

    if(!url){
        console.log('argh',url);
    }
    if(root && url.indexOf('http') !== 0)  {

            root = aliasMap ? (aliasMap[root] || root) : root;
            const lastChar = root.substr(-1);
            url = (lastChar !== '/') ? root + '/' + url : root + url;

    }

    ANCHOR.href = url;
    return ANCHOR.href;

};


PathResolver.resolveRoot = function resolveRoot(aliasMap, url, root){

    return toRoot(PathResolver.resolveUrl(aliasMap, url, root));

};


function toRoot(path){

    const i = path.lastIndexOf('/');
    return path.substring(0, i + 1);

}

// holds a cache of all scripts loaded by url

const ScriptLoader = {};
const status = { loaded: {}, failed: {}, fetched: {}};
const cache = {};

const listenersByUrl = {}; // loaded only, use init timeouts to request again


function cleanup(e){

    const target = e.target;
    target.onload = target.onerror = null;

}

ScriptLoader.currentScript = null;

ScriptLoader.onError = function onError(e){

    const src = e.target.src;
    const f = status.failed[src] || 0;
    status.failed[src] = f + 1;
    status.fetched[src] = false;
    cleanup(e);

    if(f < 3) {
        setTimeout(ScriptLoader.load, f * 1000, src);
    }

    console.log('script err', e);

};

ScriptLoader.onLoad = function onLoad(e){

    const src = e.target.src;
    status.loaded[src] = true;

    cache[src] = ScriptLoader.currentScript;
    ScriptLoader.currentScript.url = src;
    ScriptLoader.currentScript.root = toRoot$1(src);

    console.log(cache);
    cleanup(e);

    const listeners = listenersByUrl[src] || [];
    const len = listeners.length;
    for(let i = 0; i < len; ++i){
        const f = listeners[i];
        f.call(null, src);
    }

    listenersByUrl[src] = [];

};

ScriptLoader.read = function read(path){
    return cache[path];
};

ScriptLoader.has = function has(path){
    return !!status.loaded[path];
};

ScriptLoader.request = function request(path, callback){

    if(status.loaded[path])
        return callback.call(null, path);

    const listeners = listenersByUrl[path] = listenersByUrl[path] || [];
    const i = listeners.indexOf(callback);
    if(i === -1){
        listeners.push(callback);
    }

    ScriptLoader.load(path);

};

ScriptLoader.load = function(path){

    if(status.fetched[path]) // also true if loaded, this only clears on error
        return;

    const script = document.createElement("script");

    script.onerror = ScriptLoader.onError;
    script.onload = ScriptLoader.onLoad;
    script.async = true;
    script.charset = "utf-8";
    script.src = path;

    status.fetched[path] = true;
    document.head.appendChild(script);

};

function toRoot$1(path){
    const i = path.lastIndexOf('/');
    return path.substring(0, i + 1);
}

// todo add ability to share this among cogs, add additional paths with new callback
// thus entire trees can mount at once

function ScriptMonitor(paths, callback){

    this.callback = callback;
    this.needs = notReady(paths);
    this.needs.length === 0 ? this.callback() : requestNeeds(this);

}

function requestNeeds(monitor){

    const callback = onNeedReady.bind(monitor);

    const paths = monitor.needs;
    const len = paths.length;

    for (let i = 0; i < len; i++) {
        const path = paths[i];
        ScriptLoader.request(path, callback);
    }

}


function onNeedReady(path){

    const needs = this.needs;
    const i = needs.indexOf(path);
    needs.splice(i, 1);

    if(!needs.length)
        this.callback();

}


function notReady(arr){

    const remaining = [];

    for(let i = 0; i < arr.length; i++){
        const path = arr[i];
        if(!ScriptLoader.has(path))
            remaining.push(path);
    }

    return remaining;

}

// whenever new aliases or valves (limiting access to aliases) are encountered,
// a new aliasContext is created and used to resolve urls and directories.
// it inherits the aliases from above and then extends or limits those.
//
// the resolveUrl and resolveRoot methods determine a path from a url and/or
// directory combination (either can be an alias). if no directory is
// given -- and the url or alias is not an absolute path -- then a relative path
// is generated from the current url (returning a new absolute path).
//
// (all method calls are cached here for performance reasons)

function AliasContext(sourceRoot, aliasMap, valveMap){

    this.sourceRoot = sourceRoot;
    this.aliasMap = aliasMap ? restrict(copy(aliasMap), valveMap) : {};
    this.urlCache = {}; // 2 level cache (first root, then url)
    this.rootCache = {}; // 2 level cache (first root, then url)
    this.shared = false; // shared once used by another lower cog

}



AliasContext.prototype.clone = function(){
    return new AliasContext(this.sourceRoot, this.aliasMap);
};


AliasContext.prototype.restrictAliasList = function(valveMap){
    this.aliasMap = restrict(this.aliasMap, valveMap);
    return this;
};

AliasContext.prototype.injectAlias = function(alias){
    this.aliasMap[alias.name] = this.resolveUrl(alias.url, alias.root);
    return this;
};

AliasContext.prototype.injectAliasList = function(aliasList){


    for(let i = 0; i < aliasList.length; i++){
        this.injectAlias(aliasList[i]);
    }
    return this;
};

AliasContext.prototype.injectAliasHash = function(aliasHash){


    const list = [];
    const hash = {};

    for(const name in aliasHash){

        let url = '', root = '';
        const val = aliasHash[name];
        const parts = val.trim().split(' ');

        if(parts.length === 1){
            url = parts[0];
        } else {
            root = parts[0];
            url = parts[1];
        }

        const alias = {name: name, url: url, root: root, dependent: false, placed: false};
        hash[name] = alias;
        list.push(alias);

    }

    for(let i = 0; i < list.length; i++){
        const alias = list[i];
        if(alias.root && hash.hasOwnProperty(alias.root)){
            alias.dependent = true; // locally dependent on other aliases in this list
        }
    }

    const addedList = [];


    while(addedList.length < list.length) {

        let justAdded = 0;
        for (let i = 0; i < list.length; i++) {
            const alias = list[i];
            if(!alias.placed) {
                if (!alias.dependent || hash[alias.root].placed) {
                    justAdded++;
                    alias.placed = true;
                    addedList.push(alias);
                }
            }
        }

        if(justAdded === 0){
            throw new Error('Cyclic Alias Dependency!');
        }
    }

    for(let i = 0; i < addedList.length; i++){
        this.injectAlias(addedList[i]);
    }
    return this;

};


// given a list of objects with url and root, get urls not yet downloaded

AliasContext.prototype.freshUrls = function freshUrls(list) {

    const result = [];

    if(!list)
        return result;

    for(let i = 0; i < list.length; i++){
        const url = this.itemToUrl(list[i]);
        if(!ScriptLoader.has(url) && result.indexOf(url) === -1)
            result.push(url);
    }

    return result;

};




AliasContext.prototype.itemToUrl = function applyUrl(item) {
    return this.resolveUrl(item.url, item.root);
};


AliasContext.prototype.resolveUrl = function resolveUrl(url, root){

    const cache = this.urlCache;
    root = root || this.sourceRoot || '';
    const baseCache = cache[root] = cache[root] || {};
    return baseCache[url] = baseCache[url] ||
        PathResolver.resolveUrl(this.aliasMap, url, root);

};

AliasContext.prototype.resolveRoot = function resolveRoot(url, base){

    const cache = this.rootCache;
    base = base || this.sourceRoot || '';
    const baseCache = cache[base] = cache[base] || {};
    return baseCache[url] = baseCache[url] ||
        PathResolver.resolveRoot(this.aliasMap, url, base);

};

AliasContext.applySplitUrl = function applySplitUrl(def){

    let url = def.url || '';

    const parts = url.trim().split(' ');

    if(parts.length === 1){
        def.url = parts[0];
        def.root = '';
    } else {
        def.root = parts[0];
        def.url = parts[1];
    }

};


// limits the source hash to only have keys found in the valves hash (if present)

function restrict(source, valves){

    if(!valves)
        return source;

    const result = {};
    for(const k in valves){
        result[k] = source[k];
    }

    return result;
}

// creates a shallow copy of the source hash

function copy(source, target){

    target = target || {};
    for(const k in source){
        target[k] = source[k];
    }
    return target;

}

const PartBuilder = {};


PartBuilder.buildConfig = function buildConfig(def){

    if(!def && !this.parent) // empty root config
        def = {};

    if(def){
        def = def.config || def;
        const d = this.scope.demand('config');

        if(typeof def === 'string'){
            const meow = def + ' > config';
            this.scope.bus().meow(meow).pull();
        } else {
            d.write(def);
        }
        this.config = def;
    }
};



PartBuilder.output = function output(name, value){

    const d = this.scope.find(name);
    d.write(value);

};

PartBuilder.buildStates = function buildStates(){

    const script = this.script;
    const scope  = this.scope;
    const states = script.states;

    for(const name in states){

        const def = states[name];
        const state = scope.demand(name);

        if(def.hasValue) {

            const value = typeof def.value === 'function'
                ? def.value.call(script)
                : def.value;

            state.write(value, true);
        }

    }

    for(const name in states){

        const state = scope.grab(name);
        state.refresh();

    }

};


PartBuilder.buildWires = function buildWires(){

    const wires = this.script.wires;

    for(const name in wires){

        const def = wires[name];
        const state = this.scope.wire(name);

        if(def.hasValue) {

            const value = typeof def.value === 'function'
                ? def.value.call(this.script)
                : def.value;

            state.write(value, true);

        }

    }

    for(const name in wires){

        const state = this.scope.grab(name);
        state.refresh();

    }

};


PartBuilder.buildRelays = function buildRelays(){

    const scope = this.scope;
    const config = this.config;
    const relays = this.script.relays;
    const len = relays.length;

    for(let i = 0; i < len; ++i){

        const def = relays[i];

        const actionProp = def.action || def.wire;
        const stateProp = def.state || def.wire;

        let actionName = null;
        let stateName = null;

        if(actionProp)
            actionName = (actionProp[0] !== '$') ? '$' + actionProp : actionProp;

        if(stateProp)
            stateName = (stateProp[0] === '$') ? stateProp.substr(1) : stateProp;

        // todo -- make $ prefix correct on these too, put in separate function
        const remoteActionName = actionProp && config[actionProp];
        const remoteStateName = stateProp && config[stateProp];

        let remoteAction = remoteActionName ? scope._parent.find(remoteActionName, true) : null;
        let remoteState = remoteStateName ? scope._parent.find(remoteStateName, true) : null;

        let localAction = actionName ? scope.demand(actionName) : null;
        let localState = stateName ? scope.demand(stateName) : null;

        if(actionName && !stateName && remoteAction){ // only action goes out relay
            scope.bus().addSubscribe(actionName, localAction).write(remoteAction);
        }

        if(stateName && !actionName && remoteState){ // only state comes in relay
            scope.bus().addSubscribe(remoteStateName, remoteState).write(localState).pull();
        }

        if(actionName && stateName){ // defines both
            if(remoteAction && remoteState){ // wire action and state (wire together above)
                scope.bus().addSubscribe(actionName, localAction).write(remoteAction);
                scope.bus().addSubscribe(remoteStateName, remoteState).write(localState).pull();
            } else if (remoteAction && !remoteState){
                // assert relay has action sans state
            } else if (remoteState && !remoteAction){
                // assert relay has state sans action
            } else { // neither configured, wire locally
                // warning -- relay disconnected
                scope.bus().addSubscribe(actionName, localAction).write(localState);
            }
        }


    }

};


PartBuilder.buildActions = function buildActions(){

    const actions = this.script.actions;
    const len = actions.length;

    for(let i = 0; i < len; ++i){

        const def = actions[i];
        this.scope.action(def.name);
        // also {bus, accept}

    }

};

function Trait(cog, def){

    this.cog = cog;
    this.config = def.config || def;
    this.url = cog.aliasContext.resolveUrl(def.url, def.root);
    this.script = Object.create(ScriptLoader.read(this.url));
    this.script.cog = cog;
    this.script.trait = this;
    this.script.config = this.config;
    this.script.api = cog.api;
    this.scope = cog.scope.createChild();

   this.buildRelays();
   this.buildBuses();

}

Trait.prototype.buildRelays = PartBuilder.buildRelays;
Trait.prototype.output = PartBuilder.output;

Trait.prototype.buildBuses = function buildBuses(){

    const buses = this.script.buses || [];
    const wires = this.script.wires || [];
    const scope = this.scope;

    const len = buses.length;

    for(const name in wires){
        const bus = this.scope._wires[name];
        bus.pull();
    }

    for(let i = 0; i < len; ++i){

        const def = buses[i];
        const bus = scope.bus().context(this.script).meow(def); // todo add function support not just meow str
        bus.pull();

    }

};

const pool = [];

function createSlot(){
    const d = document.createElement('slot');
    d.style.display = 'none';
    return d;
}

const Placeholder = {};

Placeholder.take = function(){
    return pool.length ? pool.shift() : createSlot();
};

Placeholder.give = function(el){

    if(el.parentNode)
        el.parentNode.removeChild(el);

    if(el.hasAttribute('name'))
        el.removeAttribute('name');

    pool.push(el);

};

let _id$1 = 0;

function Gear(url, slot, parent, def){

    this.id = ++_id$1;
    this.placeholder = slot;
    this.head = null;

    this.elements = [];
    this.children = [];
    this.parent = parent;
    this.scope = parent.scope.createChild();
    this.root = parent.root;
    this.config = null; //(def && def.config) || def || {};
    this.aliasContext = parent.aliasContext;


    this.buildConfig(def);
    // todo add err url must be data pt! not real url (no dots in dp)

    const meow = url + ' * createCog';
    this.bus = this.scope.bus().context(this).meow(meow).pull();

}

Gear.prototype.buildConfig = PartBuilder.buildConfig;



Gear.prototype.killPlaceholder = function() {

    if(!this.placeholder)
        return;

    Placeholder.give(this.placeholder);
    this.placeholder = null;

};



Gear.prototype.createCog = function createCog(msg){


    const children = this.children;
    const aliasContext = this.aliasContext;
    const url = aliasContext.resolveUrl(msg, this.root);

    if(children.length){

        const oldCog = children[0];
        const el = oldCog.getFirstElement(); //oldCog.elements[0]; // todo recurse first element for virtual cog
        const slot = Placeholder.take();
        el.parentNode.insertBefore(slot, el);
        const cog = new Cog(url, slot, this);
        children.push(cog);
        children.shift();
        oldCog.destroy();

    } else {

        const cog = new Cog(url, this.placeholder, this);
        children.push(cog);

    }



};

Gear.prototype.hasDisplayElement = function hasDisplayElement(){
    return !!(this.placeholder || this.elements.length > 0);
};


Gear.prototype.getFirstElement = function(){

    let c = this;
    while(c && !c.placeholder && c.elements.length === 0){
        c = c.head;
    }
    return c.placeholder || c.elements[0];

};


Gear.prototype.destroy =  function(){

    this.dead = true;

    const len = this.children.length;
    for(let i = 0; i < len; ++i){
        const c = this.children[i];
        c.destroy();
    }

    if(this.placeholder){
        this.killPlaceholder();
    }

    this.scope.destroy();
    this.children = [];

};

let _id$2 = 0;

function Chain(url, slot, parent, def, sourceName, keyField){

    this.id = ++_id$2;
    this.head = null;
    this.placeholder = slot;

    this.elements = [];
    this.namedElements = {};
    this.children = [];
    this.parent = parent || null;
    this.scope = parent ? parent.scope.createChild() : Catbus.createChild();
    this.url = url;
    this.root = '';
    this.script = null;
    this.config = null; //(def && def.config) || def || {};
    this.scriptMonitor = null;
    this.aliasValveMap = null;
    this.aliasContext = null;
    this.sourceName = sourceName;
    this.keyField = keyField;
    this.bus = null;

    this.buildConfig(def);

    this.load();

}

Chain.prototype.buildConfig = PartBuilder.buildConfig;



Chain.prototype.killPlaceholder = function() {

    if(!this.placeholder)
        return;

    Placeholder.give(this.placeholder);
    this.placeholder = null;

};


Chain.prototype.load = function() {

    if(ScriptLoader.has(this.url)){
        this.onScriptReady();
    } else {
        ScriptLoader.request(this.url, this.onScriptReady.bind(this));
    }

};

Chain.prototype.onScriptReady = function() {

    this.script = Object.create(ScriptLoader.read(this.url));
    this.script.id = this.id;
    this.script.config = this.config;
    this.root = this.script.root;
    this.prep();

};


Chain.prototype.prep = function(){

    const parent = this.parent;
    const aliasValveMap = parent ? parent.aliasValveMap : null;
    //const aliasList = this.script.alias;
    const aliasHash = this.script.aliases;

    if(parent && parent.root === this.root && !aliasHash && !aliasValveMap){
        // same relative path, no new aliases and no valves, reuse parent context
        this.aliasContext = parent.aliasContext;
        this.aliasContext.shared = true;
    } else {
        // new context, apply valves from parent then add aliases from cog
        this.aliasContext = parent
            ? parent.aliasContext.clone()
            : new AliasContext(this.root); // root of application
        this.aliasContext.restrictAliasList(aliasValveMap);
        //this.aliasContext.injectAliasList(aliasList);
        this.aliasContext.injectAliasHash(aliasHash);
    }

    this.loadBooks();

};



Chain.prototype.loadBooks = function loadBooks(){

    if(this.script.books.length === 0) {
        this.loadTraits();
        return;
    }

    const urls = this.aliasContext.freshUrls(this.script.books);

    if (urls.length) {
        this.scriptMonitor = new ScriptMonitor(urls, this.readBooks.bind(this));
    } else {
        this.readBooks();
    }



};




Chain.prototype.readBooks = function readBooks() {

    const urls = this.script.books;

    if(this.aliasContext.shared) // need a new context
        this.aliasContext = this.aliasContext.clone();

    for (let i = 0; i < urls.length; ++i) {

        const url = urls[i];
        const book = ScriptLoader.read(url);
        if(book.type !== 'book')
            console.log('EXPECTED BOOK: got ', book.type, book.url);

        this.aliasContext.injectAliasList(book.alias);

    }

    this.loadTraits();

};


Chain.prototype.loadTraits = function loadTraits(){

    const urls = this.aliasContext.freshUrls(this.script.traits);

    if(urls.length){
        this.scriptMonitor = new ScriptMonitor(urls, this.build.bind(this));
    } else {
        this.build();
    }

};



Chain.prototype.getNamedElement = function getNamedElement(name){

    if(!name)
        return null;

    const el = this.namedElements[name];

    if(!el)
        throw new Error('Named element ' + name + ' not found in display!');

    return el;

};

Chain.prototype.build = function build(){ // urls loaded

    const meow = this.sourceName + ' * buildCogsByIndex';
    this.bus = this.scope.bus().context(this).meow(meow).pull();

};


Chain.prototype.buildCogsByIndex = function buildCogsByIndex(msg){

    const len = msg.length;
    const children = this.children;
    const childCount = children.length;
    const updateCount = len > childCount ? childCount : len;

    // update existing
    for(let i = 0; i < updateCount; ++i){
        const d = msg[i];
        const c = children[i];
        c.source.write(d);
    }

    if(len === 0 && childCount > 0){

        // restore placeholder as all children will be gone
        const el = this.getFirstElement(); // grab first child element
        this.placeholder = Placeholder.take();
        el.parentNode.insertBefore(this.placeholder, el);

    }

    if(childCount < len) { // create new children

        const lastEl = this.getLastElement();
        const nextEl = lastEl.nextElementSibling;
        const parentEl = lastEl.parentNode;
        const before = !!nextEl;
        const el = nextEl || parentEl;

        for (let i = childCount; i < len; ++i) {
            // create cogs for new data
            const slot = Placeholder.take();
            if (before) {
                el.parentNode.insertBefore(slot, el);
            } else {
                el.appendChild(slot);
            }
            const cog = new Cog(this.url, slot, this, this.config, i);
            const d = msg[i];
            cog.source.write(d);
            children.push(cog);

        }

    } else {

        for (let i = childCount - 1; i >= len; --i) {
            // remove cogs without corresponding data
            children[i].destroy();
            children.splice(i, 1);
        }
    }

    this.tail = children.length > 0 ? children[children.length - 1] : null;
    this.head = children.length > 0 ? children[0] : null;


};

Chain.prototype.getFirstElement = function(){

    let c = this;
    while(c && !c.placeholder && c.elements.length === 0){
        c = c.head;
    }
    return c.placeholder || c.elements[0];

};

Chain.prototype.getLastElement = function(){

    let c = this;
    while(c && !c.placeholder && c.elements.length === 0){
        c = c.tail;
    }
    return c.placeholder || c.elements[c.elements.length - 1];

};


Chain.prototype.destroy = function(){

    this.dead = true;

    const len = this.children.length;
    for(let i = 0; i < len; ++i){
        const c = this.children[i];
        c.destroy();
    }

    if(this.placeholder){
        this.killPlaceholder();
    } else {

        const len = this.elements.length;
        for(let i = 0; i < len; ++i){
            const e = this.elements[i];
            e.parentNode.removeChild(e);
        }
    }


    this.scope.destroy();
    this.children = [];

};

function AlterDom(el) {

    this._el = el;
    this._display = this.style.display;
    this._visible = false;

}

// todo add getter for el (read only)

AlterDom.prototype.focus = function focus() {
    this._el.focus();
};

AlterDom.prototype.blur = function blur() {
    this._el.focus();
};

AlterDom.prototype.value = function value(value) {
    if(arguments.length === 0) {
        return this.el.value;
    }
    this.value = value;
};

AlterDom.prototype.toggleFocus = function toggleFocus(focus) {

    focus ? this._el.focus() : this._el.blur();

};

AlterDom.prototype.toggleDisplay = function toggleDisplay(visible) {

    if(arguments.length === 0) {
        this._visible = !this._visible;
    } else {
        this._visible = visible;
    }
    this._updateDisplay();

};

AlterDom.prototype.showDisplay = function showDisplay(display) {

    this._visible = true;
    if(arguments.length === 1) {
        this._display = display;
    }
    this._updateDisplay();

};

AlterDom.prototype.hideDisplay = function hideDisplay(display) {

    this._visible = false;
    if(arguments.length === 1) {
        this._display = display;
    }
    this._updateDisplay();

};


AlterDom.prototype._updateDisplay = function _updateDisplay() {

    const display = this._visible ? this._display || 'block' : 'none';
    this._el.style.display = display;

};

AlterDom.prototype.text = function text(text) {

    this._el.innerText = text;

};

AlterDom.prototype.toggleClasses = function(changes){

    const toHash = function(acc, v){ acc[v] = true; return acc;};
    const current = this._el.className.split(' ').reduce(toHash, {});

    for(const k in changes){
        current[k] = changes[k];
    }

    const result = [];
    for(const k in current) {
        if(current[k])
            result.push(k);
    }

    this._el.className = result.join(' ');
    return this;

};

AlterDom.prototype.toggleClass = function(name, present){
    const p = {};
    p[name] = present;
    return this.toggleClasses(p);
};

AlterDom.prototype.removeClass = function(name){
    const p = {};
    p[name] = false;
    return this.toggleClasses(p);
};

AlterDom.prototype.addClass = function(name){
    const p = {};
    p[name] = true;
    return this.toggleClasses(p);
};

AlterDom.prototype.attr = function(name, value) {
    if(typeof value !== 'string') {
        this._el.removeAttribute(name);
    } else {
        this._el.setAttribute(name, value);
    }
    return this;
};

AlterDom.prototype.attrs = function(changes) {
    for(const k in changes){
        this.attr(k, changes[k]);
    }
    return this;
};

AlterDom.prototype.prop = function(name, value) {
    this._el[name] = value;
    return this;
};

AlterDom.prototype.props = function(changes) {
    for(const k in changes){
        this.prop(k, changes[k]);
    }
    return this;
};

AlterDom.prototype.style = function(name, value) {
    this._el.style[name] = value;
    return this;
};

AlterDom.prototype.styles = function(changes) {
    for(const k in changes){
        this.style(k, changes[k]);
    }
    return this;
};

let _id = 0;

function Cog(url, slot, parent, def, index, key){

    this.id = ++_id;
    this.type = 'cog';
    this.dead = false;

    this.head = null;
    this.tail = null;
    this.first = null;
    this.last = null;

    this.placeholder = slot;
    this.elements = [];
    this.namedSlots = {};
    this.namedElements = {};
    this.children = [];
    this.parent = parent || null;
    this.scope = parent ? parent.scope.createChild() : Catbus.createChild();
    this.url = url;
    this.root = '';
    this.script = null;
    this.config = null; //(def && def.config) || def || {}; // todo inherit parent config if in chain?
    this.source = this.scope.demand('source');

    this.index = index;
    this.key = key;
    this.scriptMonitor = null;
    this.aliasValveMap = null;
    this.aliasContext = null;

    this.bookUrls = null;
    this.traitUrls = null;

    this.traitInstances = [];
    this.busInstances = [];

    this.buildConfig(def);


    this.load();

}



Cog.prototype.mountDisplay = function() {

    if(!this.script.display) // check for valid html node
        return;

    let frag = document
        .createRange()
        .createContextualFragment(this.script.display);

    const named = frag.querySelectorAll('[name]');
    const len = named.length;
    const hash = this.namedElements;
    const scriptEls = this.script.els = {};
    const scriptDom = this.script.dom = {};

    for(let i = 0; i < len; ++i){
        const el = named[i];
        const name = el.getAttribute('name');
        const tag = el.tagName;
        if(tag === 'SLOT'){
            this.namedSlots[name] = el;
        } else {
            hash[name] = el;
            scriptEls[name] = el;
            scriptDom[name] = new AlterDom(el);
        }
    }

    this.elements = [].slice.call(frag.childNodes, 0);
    this.placeholder.parentNode.insertBefore(frag, this.placeholder);
    Placeholder.give(this.placeholder);
    this.placeholder = null;

};


Cog.prototype.load = function() {

    if(ScriptLoader.has(this.url)){
        this.onScriptReady();
    } else {
        ScriptLoader.request(this.url, this.onScriptReady.bind(this));
    }

};

Cog.prototype.onScriptReady = function() {

    const def = ScriptLoader.read(this.url);
    this.script = Object.create(def);
    this.script.id = this.id;
    this.script.config = this.config;
    this.script.cog = this;
    this.root = this.script.root;
    this.prep();

};


Cog.prototype.prep = function(){

    const parent = this.parent;
    const aliasValveMap = parent ? parent.aliasValveMap : null;
    // const aliasList = this.script.alias;
    const aliasHash = this.script.aliases;

    if(parent && parent.root === this.root && !aliasHash && !aliasValveMap){
        // same relative path, no new aliases and no valves, reuse parent context
        this.aliasContext = parent.aliasContext;
        this.aliasContext.shared = true;
    } else {
        // new context, apply valves from parent then add aliases from cog
        this.aliasContext = parent
            ? parent.aliasContext.clone()
            : new AliasContext(this.root); // root of application
        this.aliasContext.restrictAliasList(aliasValveMap);
        //this.aliasContext.injectAliasList(aliasList);
        this.aliasContext.injectAliasHash(aliasHash);
    }

    this.script.prep();
    this.loadBooks();

};



Cog.prototype.loadBooks = function loadBooks(){

    if(this.script.books.length === 0) {
        this.loadTraits();
        return;
    }

    const urls = this.bookUrls = this.aliasContext.freshUrls(this.script.books);

    if (urls.length) {
        this.scriptMonitor = new ScriptMonitor(urls, this.readBooks.bind(this));
    } else {
        this.readBooks();
    }



};




Cog.prototype.readBooks = function readBooks() {

    const urls = this.script.books;

    if(this.aliasContext.shared) // need a new context
        this.aliasContext = this.aliasContext.clone();

    for (let i = 0; i < urls.length; ++i) {

        const url = urls[i];
        const book = ScriptLoader.read(url);
        if(book.type !== 'book')
            console.log('EXPECTED BOOK: got ', book.type, book.url);

        this.aliasContext.injectAliasList(book.alias);

    }

    this.loadTraits();

};


Cog.prototype.loadTraits = function loadTraits(){

    const urls = this.traitUrls = this.aliasContext.freshUrls(this.script.traits);

    if(urls.length){
        this.scriptMonitor = new ScriptMonitor(urls, this.build.bind(this));
    } else {
        this.build();
    }

};

Cog.prototype.buildStates = PartBuilder.buildStates;
Cog.prototype.buildWires = PartBuilder.buildWires;
Cog.prototype.buildRelays = PartBuilder.buildRelays;
Cog.prototype.buildActions = PartBuilder.buildActions;
Cog.prototype.output = PartBuilder.output;
Cog.prototype.buildConfig = PartBuilder.buildConfig;

Cog.prototype.buildEvents = function buildEvents(){

    // todo add compile check -- 'target el' not found in display err!

    const events = this.script.events;
    const buses = this.busInstances;
    const scope = this.scope;

    for(const name in events){

        const value = events[name];
        const el = this.script.els[name];

        _ASSERT_HTML_ELEMENT_EXISTS(name, el);

        if(Array.isArray(value)){
            for(let i = 0; i < value.length; ++i){
                const bus = scope.bus().context(this.script).target(el).meow(value[i]);
                buses.push(bus);
            }
        } else {
            const bus = scope.bus().context(this.script).target(el).meow(value);
            buses.push(bus);
        }

    }

};

Cog.prototype.buildBuses = function buildBuses(){

    const buses = this.script.buses;
    const wires = this.script.wires;
    const scope = this.scope;

    const len = buses.length;
    const instances = this.busInstances;

    for(const name in wires){
        const bus = this.scope._wires[name];
        bus.pull();
    }

    for(let i = 0; i < len; ++i){

        const def = buses[i];
        const bus = scope.bus().context(this.script).meow(def); // todo add function support not just meow str
        bus.pull();
        instances.push(bus);

    }

};


//
// Cog.prototype.buildBusFromNyan = function buildBusFromNyan(nyanStr, el){
//     return this.scope.bus(nyanStr, this.script, el);
// };
//
// Cog.prototype.buildBusFromFunction = function buildBusFromFunction(f, el){
//
//     //const bus = this.scope.bus()
// };



Cog.prototype.buildCogs = function buildCogs(){

    const cogs = this.script.cogs;
    const children = this.children;
    const aliasContext = this.aliasContext;
    // todo work this out in script load for perf
    const count = this.elements.length;

    this.first = count ? this.elements[0] : null;
    this.last = count ? this.elements[count - 1] : null;

    for(const slotName in cogs){

        const def = cogs[slotName];
        AliasContext.applySplitUrl(def);

        const slot = this.namedSlots[slotName];
        let cog;

        if(def.type === 'gear') {
            cog = new Gear(def.url, slot, this, def);
        } else if (def.type === 'chain') {
            const url = aliasContext.resolveUrl(def.url, def.root);
            cog = new Chain(url, slot, this, def, def.source);
        } else {
            const url = aliasContext.resolveUrl(def.url, def.root);
            cog = new Cog(url, slot, this, def);
        }

        children.push(cog);

        if(slot === this.first)
            this.head = cog;

        if(slot === this.last)
            this.tail = cog;

    }


};

Cog.prototype.buildGears = function buildGears(){

    const gears = this.script.gears;
    const children = this.children;
    const count = this.elements.length;

    this.first = count ? this.elements[0] : null;
    this.last = count ? this.elements[count - 1] : null;

    for(const slotName in gears){

        const def = gears[slotName];

        const slot = this.namedSlots[slotName];
        const gear = new Gear(def.url, slot, this, def);

        children.push(gear);

        if(slot === this.first)
            this.head = gear;

        if(slot === this.last)
            this.tail = gear;

    }


};

Cog.prototype.buildChains = function buildChains(){

    const chains = this.script.chains;
    const children = this.children;
    const aliasContext = this.aliasContext;
    // todo work this out in script load for perf
    const count = this.elements.length;

    this.first = count ? this.elements[0] : null;
    this.last = count ? this.elements[count - 1] : null;

    for(const slotName in chains){

        const def = chains[slotName];
        AliasContext.applySplitUrl(def);

        const slot = this.namedSlots[slotName];

        const url = aliasContext.resolveUrl(def.url, def.root);
        const chain = new Chain(url, slot, this, def.config, def.source);

        children.push(chain);

        if(slot === this.first)
            this.head = chain;

        if(slot === this.last)
            this.tail = chain;

    }


};


Cog.prototype.getNamedElement = function getNamedElement(name){

    if(!name)
        return null;

    const el = this.namedElements[name];

    if(!el)
        throw new Error('Named element ' + name + ' not found in display!');

    return el;

};

Cog.prototype.buildTraits = function buildTraits(){

    const traits = this.script.traits;
    const instances = this.traitInstances;

    const len = traits.length;
    for(let i = 0; i < len; ++i){

        const def = traits[i]; // todo url and base instead of url/root?
        const instance = new Trait(this, def);
        instances.push(instance);
        instance.script.prep();

    }

};


Cog.prototype.initTraits = function initTraits(){

    const traits = this.traitInstances;
    const len = traits.length;
    for(let i = 0; i < len; ++i){
        const script = traits[i].script;
        script.init();
    }

};

Cog.prototype.mountTraits = function mountTraits(){

    const traits = this.traitInstances;
    const len = traits.length;
    for(let i = 0; i < len; ++i){
        const script = traits[i].script;
        script.mount();
    }

};

Cog.prototype.startTraits = function startTraits(){

    const traits = this.traitInstances;
    const len = traits.length;
    for(let i = 0; i < len; ++i){
        const script = traits[i].script;
        script.start();
    }

};

Cog.prototype.build = function build(){ // urls loaded

    // script.prep is called earlier

    this.mount(); // mounts display, calls script.mount, then mount for all traits

    this.buildStates();
    this.buildWires();
    this.buildActions();
    this.buildRelays();

    this.script.init();

    this.buildTraits(); // calls prep on all traits -- mixes states, actions, etc
    this.initTraits(); // calls init on all traits

    this.buildBuses();
    this.buildEvents();

    this.buildCogs(); // placeholders for direct children, async loads possible
    this.buildGears();
    this.buildChains();
    this.start(); // calls start for all traits

};

Cog.prototype.getFirstElement = function(){

    let c = this;
    while(c && !c.placeholder && c.elements.length === 0){
        c = c.head;
    }

    return c.placeholder || c.elements[0];

};

Cog.prototype.getLastElement = function(){

    let c = this;
    while(c && !c.placeholder && c.elements.length === 0){
        c = c.tail;
    }
    return c.placeholder || c.elements[c.elements.length - 1];

};

Cog.prototype.mount = function mount(){

    this.mountDisplay();
    this.script.mount();
    this.mountTraits();

};

Cog.prototype.start = function start(){

    this.script.start();
    this.startTraits();

};

Cog.prototype.restorePlaceholder = function restorePlaceholder(){

};

Cog.prototype.destroy = function(){

    this.dead = true;


    for(let i = 0; i < this.children.length; ++i){
        const c = this.children[i];
        c.destroy();
    }

    for(let i = 0; i < this.elements.length; ++i){
        const e = this.elements[i];
        e.parentNode.removeChild(e);
    }

    this.script.destroy();
    this.scope.destroy();
    this.children = [];

};

function _ASSERT_HTML_ELEMENT_EXISTS(name, el){
    if(!el){
        throw new Error('HTML Element + named [' + name + '] not found in display!' )
    }
}

let Muta = {};
const NOOP = function(){};
const TRUE = function(){ return true;};

Muta.init = function init(slot, url){

    url = PathResolver.resolveUrl(null, url);
    return new Cog(url, slot);

};

const defaultMethods = ['prep','init','mount','start','unmount','destroy'];
const defaultArrays = ['alias', 'traits', 'states', 'actions', 'buses', 'books', 'relays'];
const defaultHashes = ['els', 'cogs', 'chains', 'gears', 'methods', 'events'];



function createWhiteList(v){

    if(typeof v === 'function') // custom acceptance function
        return v;

    if(Array.isArray(v)) {
        return function (x) {
            return v.indexOf(x) !== -1;
        }
    }

    return TRUE;
}

function prepCogDefs(data){

    if(!data)
        return data;

    for(const name in data){

        const val = data[name];
        const def = val && typeof val === 'string' ? {url: val} : val;
        data[name] = def;

    }

    return data;

}

function prepDataDefs(data, asActions){

    if(!data)
        return data;

    for(const name in data){


        const val = data[name];
        const def = val && typeof val === 'object' ? val : {value: val};

        def.hasValue = def.hasOwnProperty('value');
        def.hasAccept = def.hasOwnProperty('accept');
        def.value = def.hasValue && def.value;
        def.accept = def.hasAccept ? createWhiteList(def.hasAccept) : NOOP;
        def.name = (asActions && name[0] !== '$') ? '$' + name : name;

        data[name] = def;

    }

    return data;

}


Muta.cog = function cog(def){


    def.id = 0;
    def.api = null;
    def.config = null;
    def.type = 'cog';


    for(let i = 0; i < defaultHashes.length; i++){
        const name = defaultHashes[i];
        def[name] = def[name] || {};
    }

    for(let i = 0; i < defaultArrays.length; i++){
        const name = defaultArrays[i];
        def[name] = def[name] || [];
    }

    for(let i = 0; i < defaultMethods.length; i++){
        const name = defaultMethods[i];
        def[name] = def[name] || NOOP;
    }


    def.cogs = prepCogDefs(def.cogs);
    def.gears = prepCogDefs(def.gears);
    def.states = prepDataDefs(def.states);
    def.wires  = prepDataDefs(def.wires);
    def.actions  = prepDataDefs(def.actions, true);

    ScriptLoader.currentScript = def;

};


Muta.trait = function trait(def){

    def.type = 'trait';
    def.config = null;
    def.cog = null; // becomes cog script instance
    def.trait = null;

    for(let i = 0; i < defaultMethods.length; i++){
        const name = defaultMethods[i];
        def[name] = def[name] || NOOP;
    }

    ScriptLoader.currentScript = def;

};

Muta.book = function book(def){

    def.type = 'book';
    ScriptLoader.currentScript = def;

};

Muta.loadScript = function(path){
    ScriptLoader.load(path);
};

Muta.getScriptMonitor = function(paths, readyCallback){
    return new ScriptMonitor(paths, readyCallback);
};

return Muta;

})));
//# sourceMappingURL=muta.umd.js.map
