;(function VASH(context) {

    var Vash = {};

    var plugins = typeof seele !== 'undefined' && seele;
    if(plugins)
        plugins.register('vash', Vash, true);
    else
        context.Vash = Vash; // bind to outer context

    var activeScriptData = null; // set externally

    // parsing results cached by resolvedUrl

    var blueprintMap = {};
    var displayMap = {};
    var scriptMap = {};

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


    Vash.hasFile = function(url){
        return blueprintMap.hasOwnProperty(url);
    };

    Vash.blueprint = function(url){
        return blueprintMap[url];
    };

    Vash.script = function(url){

        var script = scriptMap[url] || defaultScriptDataPrototype;
        return Object.create(script);

    };

    Vash.display = function(url){
        return displayMap[url];
    };


    function buildFragment(str) {

        var elem, tmp, i,
            fragment = document.createDocumentFragment(),
            nodes = [];

        tmp = fragment.appendChild(document.createElement("div"));

        tmp.innerHTML = str.replace(rxhtmlTag, "<$1></$2>") ;

        for(i = 0; i < tmp.childNodes.length; i++) {
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

    function childNodesByName(node){

        var result = {};
        if(!node)
            return result;

        var children = node.childNodes;
        var i = 0;
        var n;

        while((n = children[i++])){
            var tag = n.localName;
            var arr = result[tag] = result[tag] || [];
            arr.push(n);
        }

        return result;
    }

    function unwrapDisplay(display){ //

        if(!display) return null;
        var fragment = document.createDocumentFragment();
        var children = display.children;
        while(children.length){
            fragment.appendChild(children[0]);
        }
        return fragment;
    }


    Vash.parseFile = function(url, text){

        var frag = buildFragment(text);

        var blueSel = childNodesByName(frag.querySelector('blueprint'));
        var scriptSel = frag.querySelector('script');
        var htmlSel = unwrapDisplay(frag.querySelector('display'));

        var scriptText= scriptSel && scriptSel.innerHTML;

        if(scriptText) {
            scriptText = wrapScript(scriptText, url);
            try {
                addScriptElement(scriptText);
            } catch(err) {
                console.log(err);
            }
        } else {
            activeScriptData = activeScriptData || Object.create(defaultScriptDataPrototype);
        }

        if(!activeScriptData)
            throw new Error("Script Data Failure:" + url);

        scriptMap[url] = activeScriptData;
        activeScriptData = null;

        if(htmlSel && htmlSel.hasChildNodes())
            displayMap[url] = htmlSel;

        var blueprint = extractDeclarations(blueSel);
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
        decs.valves = [].concat(getDefs2(sel.valve, extractValveDef2));
        decs.dataSources = [].concat(getDefs2(sel.data, extractDataDef2));
        decs.dataSources = decs.dataSources.concat(getDefs2(sel.net, extractNetDef2));
        decs.services = [].concat(getDefs2(sel.service, extractServiceDef2));
        decs.feeds = [].concat(getDefs2(sel.feed, extractFeedDef2));
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
        decs.requires = decs.requires.concat(getDefs2(sel.hoist, extractAlloyDef2));
        decs.requires = decs.requires.concat(getDefs2(sel.alloy, extractAlloyDef2));
        decs.requires = decs.requires.concat(getDefs2(sel.preload, extractPreloadDef2, true));

        return decs;
    }




    function extractCommandDef2(node){

        var d = {

            name: extractString2(node, 'name'),
            pipe: extractString2(node, 'pipe'),
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
            adapt: extractString2(node, 'adapt'),
            adaptPresent: extractHasAttr2(node, 'adapt'),
            adaptType: null,
            autorun: false,
            batch: extractBool2(node, 'batch'),
            keep: 'last', // first, all, or last
            need: extractStringArray2(node, 'need'),
            gather: extractStringArray2(node, 'gather'),
            defer: extractBool2(node, 'defer')

        };

        d.watch = [d.name];

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
            thing: extractString2(node, 'is', 'data'), // data, feed, service
            pipe: extractString2(node, 'pipe'),
            toggle: extractString2(node, 'toggle'),
            demand: extractString2(node, 'demand'),
            filter: extractString2(node, 'filter'),
            topic: extractString2(node, 'for,on,topic', 'update'),
            run: extractString2(node, 'run'),
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
            adapt: extractString2(node, 'adapt'),
            adaptPresent: extractHasAttr2(node, 'adapt'),
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



    function extractServiceDef2(node){

        var d = {
            name: extractString2(node, 'name'),
            to: extractString2(node, 'to'),
            url: extractString2(node, 'url'),
            path: extractString2(node, 'path'),
            topic: extractString2(node, 'on,topic'),
            run: extractString2(node, 'run'),
            post: extractBool2(node, 'post'),
            format: extractString2(node, 'format', 'jsonp'),
            request: extractBool2(node, 'req,request'),
            prop: extractBool2(node, 'prop')
        };


        return d;

    }




    function extractCogDef2(node){

        var d = {

            path: extractString2(node, "path"),
            name: extractString2(node, "name"),
            isRoute: extractBool2(node, "route"),
            url: extractString2(node, "url"),
            source: extractString2(node, 'use') || extractString2(node, 'from,source'),
            item: extractString2(node, 'make') || extractString2(node, 'to,item','cog'),
            target: extractString2(node, "id,find"),
            action: extractString2(node, "and", 'append')

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
            prop: extractBool2(node, 'prop'),
            source: extractString2(node, "from,source"),
            item: extractString2(node, "to,value,item",'cog'),
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



    function extractFeedDef2(node){

        var d = {
            service: extractString2(node, 'service'),
            to: extractString2(node, 'to,data'), // todo decide on to or data
            request: extractBool2(node, 'req,request'),// todo change to extractBool and test
            name: extractString2(node, 'name', false),
            prop: extractBool2(node, 'prop', false)
        };

        d.name = d.name || d.service;

        return d;

    }


    function extractDataDef2(node){

        var d = {
            name: extractString2(node, 'name'),
            inherit: extractBool2(node, 'inherit'),
            isRoute: extractBool2(node, 'route'),
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


    function extractNetDef2(node){

        var d = {
            name: extractString2(node, 'name'),
            inherit: extractBool2(node, 'inherit'),
            isRoute: extractBool2(node, 'route'),
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


    function extractAliasDef2(node){

        return {
            name: extractString2(node, 'name'),
            path: extractString2(node, 'path'),
            url: extractString2(node, 'url'),
            prop: extractBool2(node, 'prop')
        };

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

})(this);