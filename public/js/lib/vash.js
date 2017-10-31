/* jshint node: false, esversion: 6 */
// version 1.8.2 -- added relay tag and filters

;(function VASH(context) {
    "use strict";

    // adding 'ghost' attribute

    var Vash = {};

    var plugins = typeof seele !== 'undefined' && seele;
    if (plugins)
        plugins.register('vash', Vash, true);
    else
        context.Vash = Vash; // bind to outer context

    var activeScriptData = null; // set externally

    // parsing results cached by resolvedUrl

    var blueprintMap = {};
    var displayMap = {};
    var scriptMap = {};
    var templateMap = {};

    var defaultScriptDataPrototype = {

        init: function () {
        },
        start: function () {
        },
        destroy: function () {
        },
        index: null,
        key: null

    };

    // cognition data types

    var DATA = 'data';
    var NUMBER = 'number';
    var PROP = 'prop';
    var STRING = 'string';
    var RUN = 'run';
    var BOOLEAN = 'bool';
    var READ = 'read';

    // the value attribute of of a data tag can be preceded by one of these

    var DATA_VALUE_TYPE_HASH = {

        data: DATA,
        num: NUMBER,
        number: NUMBER,
        prop: PROP,
        bool: BOOLEAN,
        boolean: BOOLEAN,
        string: STRING,
        run: RUN,
        read: READ

    };


    var rxhtmlTag = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi;


    Vash.hasFile = function (url) {
        return blueprintMap.hasOwnProperty(url);
    };

    Vash.blueprint = function (url) {
        return blueprintMap[url];
    };

    Vash.script = function (url) {

        var script = scriptMap[url] || defaultScriptDataPrototype;
        return Object.create(script);

    };

    Vash.display = function (url) {
        return displayMap[url];
    };

    Vash.templates = function (url) {
        return templateMap[url];
    };

    function buildFragment(str) {

        var elem, tmp, i,
            fragment = document.createDocumentFragment(),
            nodes = [];

        tmp = fragment.appendChild(document.createElement("div"));

        tmp.innerHTML = str.replace(rxhtmlTag, "<$1></$2>");

        for (i = 0; i < tmp.childNodes.length; i++) {
            nodes.push(tmp.childNodes[i]);
        }

        tmp = fragment.firstChild;
        tmp.textContent = "";
        fragment.textContent = "";

        i = 0;
        while ((elem = nodes[i++])) {
            fragment.appendChild(elem);
        }

        return fragment;
    }

    function childNodesByName(node) {

        var result = {};
        if (!node)
            return result;

        var children = node.childNodes;
        var i = 0;
        var n;

        while ((n = children[i++])) {
            var tag = n.localName;
            var arr = result[tag] = result[tag] || [];
            arr.push(n);
        }

        return result;
    }

    function unwrapDisplay(display) { //

        if (!display) return null;
        var fragment = document.createDocumentFragment();
        var children = display.children;
        while (children.length) {
            fragment.appendChild(children[0]);
        }
        return fragment;
    }


    function giveIdsToBoundNodes(bindSel) {

        var given = 0;
        for (var i = 0; i < bindSel.length; i++) {
            var node = bindSel[i];
            if (!node.hasAttribute('id')) {
                node.setAttribute('id', '_bound_node_' + i);
                given++;
            }
        }
        return given;

    }

    Vash.parseFile = function (url, text) {

        function endsWith(entireStr, ending) {
            return (entireStr.lastIndexOf(ending) === (entireStr.length - ending.length) && entireStr.length > ending.length);
        }

        var isHTML = endsWith(url, ".html");

        if (!isHTML)
            return;

        var frag = buildFragment(text);

        var blueSel = childNodesByName(frag.querySelector('blueprint'));
        var scriptSel = frag.querySelector('script');
        var htmlSel = unwrapDisplay(frag.querySelector('display'));
        var bindSel = htmlSel ? htmlSel.querySelectorAll("[bind]") : [];

        var given = giveIdsToBoundNodes(bindSel);

        var templSel = {};
        var templId = 0;

        var scriptText = scriptSel && scriptSel.innerHTML;

        if (scriptText) {
            scriptText = wrapScript(scriptText, url);
            try {
                addScriptElement(scriptText);
            } catch (err) {
                console.log(err);
            }
        } else {
            activeScriptData = activeScriptData || Object.create(defaultScriptDataPrototype);
        }

        if (!activeScriptData)
            throw new Error("Script Data Failure:" + url);


        var templateSensors = [];


        for (var i = 0; i < bindSel.length; i++) {
            var node = bindSel[i];
            var id = node.getAttribute('id');
            var plans = parseTemplate(node.getAttribute('bind'));
            for (var j = 0; j < plans.length; j++) {
                var plan = plans[j];
                var def = createSensorDefFromPlan(id, plan, j); // using activeScriptData as the target for new transform methods
                templateSensors.push(def);
            }
        }

        function createTemplateRenderMethod(id, attrName){

            var f = function templateTransformMethod(msg, topic, tag) {
                return doTemplateRenderMethod.call(this, id, attrName, msg);
            };

            return f;

        }


        function createTemplateTransformMethod(id, plan) {

            var f = function templateTransformMethod(msg, topic, tag) {
                return doTemplateTransformMethod.call(this, id, plan, msg);
            };

            return f;
        }


        function doTemplateRenderMethod(id, attrName, msg){

            var node = this[id].raw();
            if (attrName === "value") {
                node.value = msg;
            } else {
                node[attrName] = msg;
            }

        }

        /**
        * Recieves a subset of the plan objects
        */
        function doTemplateTransformMethod(id, plan, msg){

            var cur = msg;
            var mi = this.mapItem;

            for (var i = 0; i < plan.length; i++) {
                var tok = plan[i];

                if (tok.type === "prop") {

                    if (tok.optional) {
                        cur = cur[tok.name] || "";
                    } else {
                        if (!cur.hasOwnProperty(tok.name)) {
                            throw new Error("Trying to grab missing prop " + tok.name + " from val of " + plan[i - 1].name);
                        } else {
                            cur = cur[tok.name];
                        }
                    }

                } else if (Array.isArray(tok)) {

                    var vals = {};
                    for (var j = 0; j < tok.length; j++) {
                        vals[tok[j].name] = mi.findData(tok[j].name).read(tok[j].topic || "update");
                    }

                    cur = vals;

                } else if (tok.type === "data") {
                    cur = mi.findData(tok.name).read(tok.topic);

                } else if (tok.type === "method") {

                    if (!mi.scriptData[tok.name]) {
                        throw new Error("Cog has no transform or filter method (" + tok.name + ") in scope");
                    }

                    cur = mi.scriptData[tok.name](cur);

                } else if (tok.type === "attr") {
                    var _node = mi.scriptData[id].raw();

                    if (tok.name === "value") {
                        cur = _node.value;
                    } else {
                        cur = mi.scriptData[id].raw().getAttribute(tok.name);
                    }
                }
            }

            return cur;

        }

        function createTransforms (id, plan, planNum, def) {

            var filterFunMap = {
                "lt-filter": function (val) {
                    return function (msg) {
                        return msg < val;
                    }
                },

                "gt-filter": function (val) {
                    return function (msg) {
                        return msg > val;
                    }
                },

                "lte-filter": function (val) {
                    return function (msg) {
                        return msg <= val;
                    }
                },

                "gte-filter": function (val) {
                    return function (msg) {
                        return msg >= val;
                    }
                },

                "eq-filter": function (val) {
                    return function (msg) {
                        return msg === val;
                    }
                },

                "neq-filter": function (val) {
                    return function (msg) {
                        return msg !== val;
                    }
                },

                // 0 > false
                // "" > false
                // "cat" > true
                "truthy-filter": function () {
                    return function (msg) {
                        return !!msg;
                    }
                },

                // 0 > true
                // "" > true
                // "cat" > false
                "falsey-filter": function () {
                    return function (msg) {
                        return !!!msg;
                    }
                }
            };

            var hasFilter = false;
            var filterPosition = null;

            for (var i = 1; i < plan.length - 1; i++) {
                if (hasFilter && plan[i].isFilter) {
                    var err = new Error("You can only bind one filter per directive. Found an extra: " + plan[i].name);
                    throw err;

                } else if (plan[i].isFilter) {
                    hasFilter = true;
                    filterPosition = i;
                }
            }

            if (hasFilter) {
                var conformMethodName = '_conform_' + id + '_' +  planNum;
                activeScriptData[conformMethodName] = createTemplateTransformMethod(id, plan.slice(1, filterPosition));

                def.adapt = conformMethodName;
                def.adaptPresent = true;
                def.adaptType = PROP;

                if (plan[filterPosition].type === "method") {
                    def.filter = plan[filterPosition].name;

                } else {
                    var filter = plan[filterPosition];
                    var filterMethodName =  "_" + filter.type + "_" + (filter.value || "") + "_" + id + "_" + planNum;

                    activeScriptData[filterMethodName] = filterFunMap[filter.type](filter.value/*, msg comes in here */);

                    def.filter = filterMethodName;
                }

                var transformMethodName = '_transform_' + id + '_' + planNum;
                activeScriptData[transformMethodName] = createTemplateTransformMethod(id, plan.slice(filterPosition + 1, -1));

            } else {
                var transformMethodName = '_transform_' + id + '_' + planNum;
                activeScriptData[transformMethodName] = createTemplateTransformMethod(id, plan.slice(1, -1));
            }

            def.transform = transformMethodName;
            def.transformPresent = true;
            def.transformType = PROP;

            return def;
        }

        function createSensorDefFromPlan(id, plan, planNum) {


            var def = {
                autorun: true,
                topic: "update",
                watch: []
            };


            var tokens = plan;

            var first = tokens[0];
            var last = tokens[tokens.length - 1];

            // everything is a need for a multi sensor
            if (Array.isArray(first)) {
                var needs = [];

                // no topic for you if you are doing a multi
                first.forEach(function doDataChunk(tok) {
                    needs.push(tok.name);
                });

                def.watch = def.need = needs;
                def.group = true;
                def.batch = true;
                def.retain = true;

            } else if (first.type && first.type === "data") {
                if (first.need) {
                    def.need = first.name;
                    def.watch = first.name;
                } else {
                    def.watch = first.name;
                    def.optional = first.optional || false;
                }

                if (first.topic) def.on = first.topic;

            } else if (first.type && first.type === "event") {
                def.find = id;
                def.topic = first.name;
            } else {
                var err = new Error("Malformed first token in plan.");
                err._token = first;
                throw err;
            }

            def = createTransforms(id, plan, planNum, def);

            if (last.type === "data") {
                def.pipe = last.name;

            } else if (last.type === "attr") {

                var renderMethodName = '_render_' + id + '_' + planNum;
                activeScriptData[renderMethodName] = createTemplateRenderMethod(id, last.name);
                def.run = renderMethodName;

            } else if (last.type === "method") {
                def.run = last.name;
            }

            //console.log(id, plan, def);
            return def;

        }


        templateMap[url] = templSel;
        scriptMap[url] = activeScriptData;
        activeScriptData = null;

        if(htmlSel && htmlSel.hasChildNodes())
            displayMap[url] = htmlSel;

        var blueprint = extractDeclarations(blueSel);

        blueprint.sensors = blueprint.sensors.concat(templateSensors);

        blueprintMap[url] = blueprint;

    };

    function wrapScript(scriptText, url) {
        return scriptText + "\n//# sourceURL=http://cognition" + url + "";
    }

    function addScriptElement(scriptText) {

        var scriptEle = document.createElement("script");
        scriptEle.type = "text/javascript";
        scriptEle.text = scriptText;
        // todo add window.onerror global debug system for syntax errors in injected scripts?
        document.head.appendChild(scriptEle);

        scriptEle.parentNode.removeChild(scriptEle);

    }


    function copyProps(source, target){
        source = source || {};
        target = target || {};
        if(source){
            for(var k in source){
                target[k] = source[k];
            }
        }
        return target;
    }

    Vash.setScriptData = function(scriptData){

        // add default methods to this nascent prototype if not present
        if(!scriptData.init)
            scriptData.init = defaultScriptDataPrototype.init;
        if(!scriptData.start)
            scriptData.start = defaultScriptDataPrototype.start;
        if(!scriptData.destroy)
            scriptData.destroy = defaultScriptDataPrototype.destroy;

        activeScriptData = scriptData;
    };

    function extractDeclarations(sel){

        var decs = {};

        function getDefs2(source, extractor, multiName){

            var result = [];

            if(!source)
                return result;

            for(var i = 0; i < source.length; i++){
                var node = source[i];
                var def = extractor(node);
                if(multiName) {
                    for(var j = 0; j < def.url.length; j++){
                        var def2 = copyProps(def, {});
                        def2.url = def.url[j];
                        result.push(def2);
                    }
                } else {
                    result.push(def);
                }
            }

            return result;
        }

        decs.aliases = [].concat(getDefs2(sel.alias, extractAliasDef2));
        decs.adapters = [].concat(getDefs2(sel.adapter, extractAdapterDef2));
        decs.relays = [].concat(getDefs2(sel.relay, extractRelayDef));
        decs.valves = [].concat(getDefs2(sel.valve, extractValveDef2));
        decs.dataSources = [].concat(getDefs2(sel.data, extractDataDef2));
        decs.dataSources = decs.dataSources.concat(getDefs2(sel.net, extractNetDef2));
        decs.dataSources = decs.dataSources.concat(getDefs2(sel.ws, extractWSDef));
        decs.methods = [].concat(getDefs2(sel.method, extractMethodDef2));
        decs.properties = [].concat(getDefs2(sel.prop, extractPropDef2));
        decs.sensors = [].concat(getDefs2(sel.sensor, extractSensorDef2));
        var commandDefs = getDefs2(sel.command, extractCommandDef2);
        decs.sensors = decs.sensors.concat(commandDefs);

        decs.commands = [];
        for(var i = 0; i < commandDefs.length; i++){
            var def = commandDefs[i];
            decs.commands.push(def.name);
        }

        decs.writes = [].concat(getDefs2(sel.write, extractWriteDef2));
        decs.cogs = [].concat(getDefs2(sel.cog, extractCogDef2));
        decs.chains = [].concat(getDefs2(sel.chain, extractChainDef2));
        decs.requires = [].concat(getDefs2(sel.require, extractLibraryDef2, true));
        decs.alloys = [].concat(getDefs2(sel.alloy, extractAlloyDef2));
        decs.requires = decs.requires.concat(getDefs2(sel.preload, extractPreloadDef2, true));
        decs.requires = decs.requires.concat(decs.alloys);
        return decs;
    }

    function extractAliasDef2(node){

        return {
            name: extractString2(node, 'name'),
            path: extractString2(node, 'path'),
            url: window.location.hostname === 'localhost' && extractHasAttr2(node, 'local') ? extractString2(node, 'local') : extractString2(node, 'url'),
            prop: extractBool2(node, 'prop')
        };

    }


    function extractCommandDef2(node){

        var d = {

            name: extractString2(node, 'name'),
            isGhost: extractBool2(node, 'ghost'),
            pipe: extractString2(node, 'pipe'),
            pipeWhere: extractString2(node, 'to', 'first'),
            toggle: extractString2(node, 'toggle'),
            filter: extractString2(node, 'filter'),
            topic: extractString2(node, 'on', 'update'),
            run: extractString2(node, 'run'),
            emit: extractString2(node, 'emit'),
            emitPresent: extractHasAttr2(node, 'emit'),
            emitType: null,
            once: extractBool2(node, 'once'),
            change: extractBool2(node, 'change', false),
            extract: extractString2(node, 'extract'),
            transform: extractString2(node, 'transform'),
            transformPresent: extractHasAttr2(node, 'transform'),
            transformType: null,
            adapt: extractString2(node, 'conform'),
            adaptPresent: extractHasAttr2(node, 'conform'),
            adaptType: null,
            autorun: false,
            batch: extractBool2(node, 'batch'),
            keep: 'last', // first, all, or last
            need: extractStringArray2(node, 'need'),
            gather: extractStringArray2(node, 'gather'),
            defer: extractBool2(node, 'defer'),
            prop: extractBool2(node, 'prop')

        };

        d.watch = [d.name];
        d.cmd = d.name;

        // gather needs and cmd -- only trigger on cmd
        if(d.gather.length || d.need.length) {
            d.gather.push(d.name);

            for (var i = 0; i < d.need.length; i++) {
                var need = d.need[i];
                if (d.gather.indexOf(need) === -1)
                    d.gather.push(need);
            }
        }

        d.batch = d.batch || d.run;
        d.group = d.batch; // todo make new things to avoid grouping and batching with positive statements
        d.retain = d.group;

        applyFieldType(d, 'transform', PROP);
        applyFieldType(d, 'emit', STRING);
        applyFieldType(d, 'adapt', PROP);

        return d;

    }

    function extractSensorDef2(node){

        var d = {

            name: extractString2(node, 'data'),
            cmd: extractString2(node, 'cmd'),
            watch: extractStringArray2(node, 'watch'),
            detect: extractString2(node, 'detect'),
            data: extractString2(node, 'data'),
            find: extractString2(node, 'id,find,node'), // todo switch all to id
            optional: extractBool2(node, 'optional'),
            where: extractString2(node, 'from,where', 'first'),
            pipeWhere: extractString2(node, 'to', 'first'),
            thing: extractString2(node, 'is', 'data'), // data, read, alias
            pipe: extractString2(node, 'pipe'),
            toggle: extractString2(node, 'toggle'),
            demand: extractString2(node, 'demand'),
            filter: extractString2(node, 'filter'),
            topic: extractString2(node, 'for,on,topic', 'update'),
            run: extractString2(node, 'run'),
            tag: extractString2(node, 'tag'),
            tagPresent: extractHasAttr2(node, 'tag'),
            tagType: null,
            emit: extractString2(node, 'emit'),
            emitPresent: extractHasAttr2(node, 'emit'),
            emitType: null,
            once: extractBool2(node, 'once'),
            retain: extractBool2(node, 'retain'), // opposite of forget, now the default
            forget: extractBool2(node, 'forget'), // doesn't retain group hash values from prior flush events
            fresh: extractBool2(node, 'fresh'), // send only fresh, new values (does not autorun with preexisting data)
            separate: extractBool2(node, 'separate'), // turns off automatic batching and grouping
            group: extractBool2(node, 'group'),
            change: extractBool2(node, 'change,distinct,skipDupes', false),
            extract: extractString2(node, 'extract'),
            transform: extractString2(node, 'transform'),
            transformPresent: extractHasAttr2(node, 'transform'),
            transformType: null,
            adapt: extractString2(node, 'conform'),
            adaptPresent: extractHasAttr2(node, 'conform'),
            adaptType: null,
            autorun: extractBool2(node, 'now,auto,autorun'),
            batch: extractBool2(node, 'batch'),
            keep: extractString2(node, 'keep', 'last'), // first, all, or last
            need: extractStringArray2(node, 'need,needs'),
            gather: extractStringArray2(node, 'gather'),
            defer: extractBool2(node, 'defer')

        };

        var i;

        // add needs to the watch
        for(i = 0; i < d.need.length; i++){
            var need = d.need[i];
            if(d.watch.indexOf(need) === -1)
                d.watch.push(need);
        }

        // add cmd to the watch list
        if(d.cmd && d.watch.indexOf(d.cmd) === -1)
            d.watch.push(d.cmd);

        // add watches to the gathering -- if gathering
        if(d.gather.length > 0) {
            for (i = 0; i < d.watch.length; i++) {
                var watch = d.watch[i];
                if (d.gather.indexOf(watch) === -1)
                    d.gather.push(watch);
            }
        }

        if(!d.find && !d.cmd && !d.fresh) // && d.watch.length > 0)
            d.autorun = true;

        d.batch = !d.separate && (d.batch || (d.watch.length > 1));
        d.group = d.batch; // todo make new things to avoid grouping and batching with positive statements
        d.retain = d.group;

        applyFieldType(d, 'transform', PROP);
        applyFieldType(d, 'emit', STRING);
        applyFieldType(d, 'tag', STRING);
        applyFieldType(d, 'adapt', PROP);

        return d;

    }

    function extractPropDef2(node){

        var d = {
            find: extractString2(node, 'find'),
            thing: extractString2(node, 'is', 'data'),
            where: extractString2(node, 'where', 'first'),
            optional: extractBool2(node, 'optional'),
            name: extractString2(node, 'name')
        };

        d.name = d.name || d.find;
        return d;

    }

    function extractWriteDef2(node){
        return {
            name: extractString2(node, 'name'),
            thing: extractString2(node, 'is', 'data'),
            where: extractString2(node, 'where', 'first'),
            value: extractString2(node, 'value')
        };
    }

    function extractAdapterDef2(node){

        var d =  {
            name: extractString2(node, 'name'),
            bypass: extractString2(node, 'bypass'),
            control: extractBool2(node, 'control'),
            optional: extractBool2(node, 'optional'),
            field: extractString2(node, 'field'),
            fieldType: null,
            item: extractString2(node, 'item')
            // todo -- add dynamic adapter that rewires?
        };

        d.name = d.name || d.field;
        d.field = d.field || d.name;

        applyFieldType(d, 'field', STRING);


        return d;
    }

    function extractRelayDef(node){

        var d =  {
            in: extractString2(node, 'in'),
            out: extractString2(node, 'out'),
            optional: extractBool2(node, 'optional'),
            prop: extractBool2(node, 'prop')
        };

        return d;
    }

    function extractValveDef2(node){
        return {
            allow: extractStringArray2(node, 'allow'),
            thing: extractString2(sel, 'is', 'data')
        };
    }

    function extractLibraryDef2(node){
        return {
            name: null,
            url: extractStringArray2(node, 'url'),
            path: extractString2(node, 'path'),
            isRoute: false,
            isAlloy: false,
            isLibrary: true,
            isPreload: false,
            preload: false
        };
    }

    function extractPreloadDef2(node){
        return {
            name: null,
            url: extractStringArray2(node, 'url'),
            path: extractString2(node, 'path'),
            isRoute: false,
            isAlloy: false,
            isLibrary: false,
            isPreload: true,
            preload: true
        };
    }

    function extractAlloyDef2(node){

        var d = {
            url: extractString2(node, 'url'),
            path: extractString2(node, 'path'),
            name: extractString2(node, 'name'),
            isRoute: extractBool2(node, 'route'),
            source: extractString2(node, 'source'),
            item: extractString2(node, 'item','itemData'),
            isAlloy: true,
            isLibrary: false,
            isPreload: false,
            preload: false
        };

        applyFieldType(d,'source', DATA);
        applyFieldType(d,'item', DATA);

        return d;
    }

    function extractCogDef2(node){

        var d = {

            path: extractString2(node, "path"),
            name: extractString2(node, "name"),
            isRoute: extractBool2(node, "route"),
            url: extractString2(node, "url"),
            source: extractString2(node, 'use') || extractString2(node, 'from,source'),
            item: extractString2(node, 'make') || extractString2(node, 'to,item','itemData'),
            target: extractString2(node, "node,id,find")

        };

        applyFieldType(d,'url');
        applyFieldType(d,'source', DATA);
        applyFieldType(d,'item', DATA);

        return d;

    }

    function extractChainDef2(node){

        var d = {
            path: extractString2(node, "path"),
            name: extractString2(node, "name"),
            isRoute: extractBool2(node, "route"),
            url: extractString2(node, "url"),
            source: extractString2(node, "from,source"),
            item: extractString2(node, "to,value,item",'itemData'),
            key: extractString2(node, "key"),
            build: extractString2(node, 'build', 'append'), // scratch, append, sort
            order: extractBool2(node, 'order'), // will use flex order css
            depth: extractBool2(node, 'depth'), // will use z-index
            target: extractString2(node, "node,id,find")

        };

        applyFieldType(d, 'source', DATA);
        applyFieldType(d, 'item', DATA);

        return d;

    }

    function extractDataDef2(node){

        var d = {
            name: extractString2(node, 'name'),
            inherit: extractBool2(node, 'inherit'),
            isRoute: extractBool2(node, 'route'),
            isGhost: extractBool2(node, 'ghost'),
            value: extractString2(node, 'value'),
            valuePresent: extractHasAttr2(node, 'value'),
            valueType: null,
            adapt: extractString2(node, 'adapt'),
            adaptType: null,
            adaptPresent: extractHasAttr2(node, 'adapt'),
            service: extractString2(node, 'service'),
            serviceType: null,
            servicePresent: extractHasAttr2(node, 'service'),
            params: extractString2(node, 'params'),
            paramsType: null,
            paramsPresent: extractHasAttr2(node, 'params'),
            url: extractString2(node, 'url'),
            path: extractString2(node, 'path'),
            verb: extractString2(node, 'verb'),
            prop: extractBool2(node, 'prop'),
            request: extractBool2(node, 'req,request', false) // todo support data loc sensored, if object then acts as params in request
        };

        applyFieldType(d, 'value');
        applyFieldType(d, 'params', PROP);
        applyFieldType(d, 'service');
        applyFieldType(d, 'adapt', PROP);

        return d;

    }

    function extractWSDef (node) {
        var def = {
            name: extractString2(node, "name"),
            socket: extractString2(node, "socket"),
            socketType: null,
            prop: extractBool2(node, 'prop')
        }

        applyFieldType(def, 'socket', PROP);

        return def;
    }

    function extractNetDef2(node){

        var d = {
            name: extractString2(node, 'name'),
            inherit: extractBool2(node, 'inherit'),
            isRoute: extractBool2(node, 'route'),
            isGhost: extractBool2(node, 'ghost'),
            value: extractString2(node, 'value'),
            valuePresent: extractHasAttr2(node, 'value'),
            valueType: null,
            adapt: extractString2(node, 'adapt'),
            adaptType: null,
            adaptPresent: extractHasAttr2(node, 'adapt'),
            service: extractString2(node, 'service'),
            serviceType: null,
            servicePresent: extractHasAttr2(node, 'service'),
            params: extractString2(node, 'params'),
            paramsType: null,
            paramsPresent: extractHasAttr2(node, 'params'),
            url: extractString2(node, 'url'),
            path: extractString2(node, 'path'),
            verb: extractString2(node, 'verb'),
            prop: extractBool2(node, 'prop'),
            request: extractBool2(node, 'req,request', false) // todo support data loc sensored, if object then acts as params in request
        };

        applyFieldType(d, 'value');
        applyFieldType(d, 'params', PROP);
        applyFieldType(d, 'service');
        applyFieldType(d, 'adapt', PROP);

        return d;

    }

    function stringToSimpleValue(str){

        if(str === 'true'){
            return true;
        } else if(str === 'false'){
            return false;
        } else if(str === 'null'){
            return null;
        } else if(str === '[]'){
            return [];
        } else if(str === '{}'){
            return {};
        } else {
            return str;
        }

    }

    function stringToPrimitive(str, type) {

        if(type === BOOLEAN) {
            return (str === 'true');
        } else if (type === NUMBER) {
            return Number(str);
        } else {
            return str;
        }
    }

    function applyFieldType(d, fieldName, defaultType){

        var str = d[fieldName];
        if(str === undefined) // field was not defined, don't need to assign a type
            return;

        var fieldTypeName = fieldName + "Type";
        var chunks = str.split(" ");

        var typeDeclared = chunks.length > 0 && DATA_VALUE_TYPE_HASH[chunks[0]];
        var type = typeDeclared || defaultType;

        d[fieldTypeName] = type;

        if(chunks.length === 1) { // no prefix for data type given, implicitly coerce to bool or null if appropriate
            d[fieldName] = (type) ? str : stringToSimpleValue(str);
        } else {
            if(typeDeclared) // check to avoid removing part of a string with spaces that didn't specify a type
                chunks.shift();
            str = chunks.join(' ');
            d[fieldName] = stringToPrimitive(str, type);
        }

    }

    function extractMethodDef2(node){

        var d = {
            name: extractString2(node, 'name'),
            func: extractString2(node, 'func'),
            bound: extractBool2(node, 'bound')
        };

        d.name = d.name || d.func;
        d.func = d.func || d.name;

        return d;
    }

    function extractHasAttr2(node, attrName){
        return !!(node && node.attributes.getNamedItem(attrName));
    }

    function extractString2(node, attrNameOrNames, defaultValue){

        var attrValue = determineFirstDefinedAttrValue2(node, attrNameOrNames);
        if(attrValue)
            return attrValue.trim();
        return defaultValue;

    }

    function extractBool2(node, attrNameOrNames, defaultValue){

        var attrValue = determineFirstDefinedAttrValue2(node, attrNameOrNames);

        if(attrValue === undefined)
            return defaultValue;
        if(attrValue === 'true')
            return true;
        if(attrValue === 'false')
            return false;

        throwParseError(node, 'bool', attrNameOrNames);

    }

    function extractStringArray2(node, attrNameOrNames){

        var attrValue = determineFirstDefinedAttrValue2(node, attrNameOrNames);
        if(attrValue)
            return stringToStringArray(attrValue);
        return [];

    }

    function stringToStringArray(str){

        var arr = str.split(',');

        for(var i = arr.length - 1; i >= 0; i--){
            var chunk = arr[i];
            var trimmed_chunk = chunk.trim();
            if(!trimmed_chunk)
                arr.splice(i, 1);
            else if(trimmed_chunk.length !== chunk.length)
                arr.splice(i, 1, trimmed_chunk);
        }

        return arr;

    }

    function determineFirstDefinedAttrValue2(node, attrNameOrNames){

        var arr = stringToStringArray(attrNameOrNames);
        var atts = node.attributes;
        for(var i = 0; i < arr.length; i++){
            var att = atts.getNamedItem(arr[i]);
            if(att)
                return att.value;
        }
        return undefined;
    }

    function tokenize (str) {
        var chains = str.split(/[;\n]/);

        return chains.map(
                function(c){ return c && c.trim();}).filter(
                function(c){ return c !== ""; });
    }

    // chain = array of links
    function parseChain (chain) {
        var links = chain.split("|").map(function(link){ return link && link.trim();});
        return links;
    }

    // for each array of links in arr of links, parse link
    // return array of bits per link in chain
    function parseLink (link) {
            // @    event
            // #    attr or prop
            // *    method
            // ?    optional object prop or data loc
            // !    needed data loc
            // .    chain/deref operator
            // :    topic separator
            // >
            // <
            // >=
            // <=
            // ===
            // !==
            // ~false
            // ~true

        //var syms = ["@", "#", "*", ">", "<", ">=", "<=", "===", "!==", "~false", "~true"];
        //var re = buildRegex(syms);

        var re = /^(@|#|\*|>=|<=|>|<|===|!==|~false|~true)/;

        var res;

        if ((res = re.exec(link))) {
            var sym = res[0];
            var len = sym.length;
            var val = link.slice(len).trim();

            // if we don't see single quotes wrapping a the val, assume
            // a number
            // (trying not to actually look at the val)
            if (/(>=|<=|>|<|===|!==)/.test(sym) && !/'.*'/.test(val)) {
                var work = val;
                val = parseFloat(work);

                if (isNaN(val)) throw new Error("Vash: NaN'd a string with parseFloat: \"" + work +"\". String values have to be single quoted (e.g. 'bark'), numbers have to be unquoted (e.g. 5).");

            } else if (/'.*'/.test(val)) {
                val = val.replace(/'/g, "");
            }

            return [sym, val];

        } else {
           var bits = link.split(".");
           return bits;
        }
    }

    // for each array of bits  of link of chain
    // return plan object
    function planLink (bits) {
        /*
         * data | dataTopic | event | attr | method | filterMethod
         * name | name      | name  | name | name   | name
         *      | topic
         */

        var typeMap = {
            "@": "event",
            "#": "attr",
            "*": "method"
        };

        var compMap = {
            "<"      : "lt-filter",
            ">"      : "gt-filter",
            "<="     : "lte-filter",
            ">="     : "gte-filter",
            "==="    : "eq-filter",
            "!=="    : "neq-filter",
            "~true"  : "truthy-filter",
            "~false" : "falsey-filter",
        };

        var plan;

        if (bits[0] in typeMap) {
            plan = {
                type: typeMap[bits[0]]
            };

            if (/\?$/.test(bits[1]) && plan.type === "method") {
                plan.isFilter = true;
                plan.name = bits[1].slice(0, -1);

            } else {
                plan.name = bits[1];
            }

            return plan;

        } else if (bits[0] in compMap) {
            plan = {
                type: compMap[bits[0]],
                isFilter: true,
                value: bits[1] || null
            };

            return plan;

        } else {
            return bits.map(planData);
        }

    }

    // d p? cp
    function planData (bit, _i) {
        // first bit is always the data loc name
        if (_i === 0) {

            var names = bit.split(",");

            if (names.length > 1) {
                var plans =  [];

                for (var j = 0; j < names.length; j++) {
                    plans.push(buildDataPlan(names[j]));
                }

                return plans;

            } else {
                return buildDataPlan(names[0]);
            }

        } else {
            return buildProp(bit);
        }
    }

    function buildProp (bit) {
        var optional = /\?$/.test(bit);

        return {
            type: "prop",
            optional: optional,
            name: optional ? bit.slice(0, -1) : bit
        };
    }

    function buildDataPlan (bit) {
        var parts = bit.split(":");

        var plan = {
            name: parts[0],
            type: "data"
        };

        if (parts[1]) plan.topic = parts[1];

        if (/\?$/.test(parts[0])) {
            plan.name = plan.name.slice(0, -1);
            plan.optional = true;
        }

        if (/!$/.test(parts[0])) {
            plan.name = plan.name.slice(0, -1);
            plan.need = true;
        }

        return plan;
    }

    function parseTemplate (attrString) {

        var chain = tokenize(attrString);
        var links = chain.map(parseChain);
        var bits  = links.map(function(link){ return link.map(parseLink);});
        var plans = bits.map(function(bitSet) { return bitSet.map(planLink);});

        /**
         * get each piece of each plan in the plans
         * (is that piece an array?)
         * then
         * get the place of that piece in the plan
         * and splice each bit of that piece
         * into the plan at the place where
         * that piece was
         *
         * flatten the array a bit, that is
         */



        for(var i = 0; i < plans.length; i++){
            var plan = plans[i];
            for(var j = 0; j < plan.length; j++){
                var piece = plan[j];

                if (Array.isArray(piece)) {

                    var place = plan.indexOf(piece);
                    var first = true;

                    for(var k = 0; k < piece.length; k++){
                        var bit = piece[k];
                        plan.splice(place++, first ? 1 : 0, bit);
                        first = false;
                    }
                }
            }
        }


        return plans;

        //for (var plan of plans) {
        //    for (var piece of plan) {
        //
        //        if (Array.isArray(piece)) {
        //            var place = plan.indexOf(piece);
        //            var first = true;
        //
        //            for (let bit of piece) {
        //                plan.splice(place++, first ? 1 : 0, bit);
        //                first = false;
        //            }
        //        }
        //    }
        //}
        //
        //return plans;
    }

})(this);
