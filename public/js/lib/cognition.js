;(function($, window) {

    /**
     * cognition.js (v2.3 templates and gather fix)
     *
     * Copyright (c) 2015 Scott Southworth, Landon Barnickle, Nick Lorenson & Contributors
     *
     * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this
     * file except in compliance with the License. You may obtain a copy of the License at:
     * http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software distributed under
     * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
     * ANY KIND, either express or implied. See the License for the specific language
     * governing permissions and limitations under the License.
     *
     * @authors Scott Southworth @darkmarmot, Landon Barnickle @landonbar, Nick Lorenson @enlore
     *
     */

    "use strict";
    var cognition = $.cognition = {};
    cognition.plugins = typeof window.seele !== 'undefined' && window.seele;

    var bus = cognition.plugins.monolith('catbus'); // functional data-bus
    var dom = cognition.plugins.monolith('rei'); // dom manipulation wrapper, jq-lite
    var parser = cognition.plugins.monolith('vash'); // turns blueprints into json
    var resolver = cognition.plugins.monolith('kakashi'); // resolves aliases and urls in contexts
    var downloader = cognition.plugins.monolith('ohmu'); // downloads batches of files
    //var fetcher = cognition.plugins.monolith('???'); // ajax/fetch actions

    var uid = 0;

    var COG_ROOT = bus.demandTree('COG_ROOT');

    var buildNum = 'NEED_BUILD_NUM';
    downloader.cacheBuster("app_version", buildNum);

    // cognition data types

    var DATA = 'data';
    var NUMBER = 'number';
    var PROP = 'prop';
    var STRING = 'string';
    var RUN = 'run';
    var BOOLEAN = 'bool';
    var OBJECT = 'object';
    var READ = 'read';


    // TODO merge note - this should be?
    var webServiceDefaults = {};

    cognition.netDefaults = function netDefaults (defaults) {
        webServiceDefaults = copyProps(defaults, webServiceDefaults);
    };

    cognition.buildNum = function(n){
        if(arguments.length == 0) return buildNum;
        buildNum = n;
        return cognition;
    };

    var contentMap = {}; // layout map, built from n-item hierarchy
    var libraryMap = {}; // by resolvedUrl, javascript files processed (don't run again)

    function destroyInnerMapItems(into){
        for(var k in into.childMap){
            var mi = into.childMap[k];

            destroyMapItem(mi);
        }
    }

    function wrapScript(scriptText, url) {
        return scriptText + "\n//# sourceURL=http://cognition" + url + "";
    }

    $.cog = function(scriptData){

        parser.setScriptData(scriptData);

    };

    cognition.init = function (node, url, debugUrl){

        var root = cognition.root = new MapItem();
        root.cogZone = COG_ROOT;

        bus.defineDeepLinker('lzs', function(dir){ return LZString.compressToEncodedURIComponent(JSON.stringify(dir))},
            function(str){ return JSON.parse(LZString.decompressFromEncodedURIComponent(str))});
        bus.setDeepLinker('lzs');

        var directions = bus.resolveDirections(window.location.search);
        if(directions)
            COG_ROOT.demandData('__DIRECTIONS__').write(directions);

        root.localSel = dom(node);
        root.targetNode = dom(node);
        root.isPinion = true;
        root.aliasContext1 = root.aliasContext2 = root.aliasContext3 = resolver.resolveAliasContext();
        root.createCog({url:url});
        if(debugUrl)
            root.createCog({url: debugUrl});

    };

    function destroyMapItem(mapItem){



        //if(!mapItem.isAlloy) {
        //
        //    for(var i = 0; i < mapItem.alloys.length; i++){
        //        var alloy = mapItem.alloys[i];
        //        destroyMapItem(alloy);
        //    }

        for (var k in mapItem.childMap) {
            var mi = mapItem.childMap[k];
            destroyMapItem(mi);
        }
        //}

        //for (var i = 0; i < mapItem.alloys.length; i++){
        //    var alloy = mapItem.alloys[i];
        //    destroyMapItem(alloy);
        //}


        if(!mapItem.scriptData)
            console.log("what?");


        mapItem.scriptData.destroy();


        if(mapItem.parent){
            delete mapItem.parent.childMap[mapItem.uid];
        }

        bus.dropHost(mapItem.uid);
        mapItem.cogZone.drop();


        if(mapItem.localSel)
            mapItem.localSel.remove();
        mapItem.localSel = null;
        if(mapItem.scriptData)
            mapItem.scriptData.mapItem = null;
        mapItem.scriptData = null;
        mapItem.parent = null;

        mapItem.destroyed = true;

        var stored = contentMap[mapItem.uid];
        if(stored === mapItem) {
            delete contentMap[mapItem.uid];
        }

    }



    var MapItem = function() {

        this.cogZone = null;
        this.origin = null; // hosting cog if this is an alloy

        this.isAlloy = false; // hoisted cog defining behaviors or mixin style features
        this.isChain = false; // abstract cog that holds an array of cogs
        this.isPinion = false; // abstract cog with a dynamic url

        this.path = null; // local directory
        this.localSel = null;
        this.scriptData = parser.script();
        this.url = null; // possibly relative url requested
        this.resolvedUrl = null; // fully qualified and resolved url using path
        this.state = null;
        this.name = null;
        this.parent = null;
        this.adapter = null;
        this.alloys = [];
        this.dataMap = {};
        this.valveMap = null;
        this.methodMap = {};
        this.childMap = {};
        this.webServiceMap = {};
        this.sockMap = {};

        this.order = false; // for chains
        this.listKey = null;

        this.uid = ++uid;
        this.destroyed = false;
        this.itemData = null;
        this.itemKey = null;
        this.itemDataLoc = null;
        this._declarationDefs = null;

        contentMap[this.uid] = this;

    };

    MapItem.prototype.findCogById = function(uid){
        return contentMap[uid];
    };



    // todo OUCH -- no underscore references should be here -- remove
    MapItem.prototype.createParams = function(parameterMap){
        var params = {};
        var self = this;
        _.forEach(parameterMap, function(val, key){
            params[key] = self.findData(val).read();
        });
        return params;
    };

    MapItem.prototype.createValues = MapItem.prototype.mapValues = function(dataNameArray){
        var values = {};
        var self = this;
        _.forEach(dataNameArray, function(val){
            values[val] = self.findData(val).read();
        });
        return values;
    };


    MapItem.prototype.destroy = function(){
        destroyMapItem(this);
    };


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

    // const
    var FIRST_COG_DECLARATIONS = [

        {name: 'properties', method: 'createProp'},
        {name: 'adapters', method: 'createAdapter'},
        {name: 'dataSources', method: 'createData'},
        {name: 'commands', method: 'demandData'},
        {name: 'methods', method: 'createMethod'},

    ];

    MapItem.prototype._cogFirstBuildDeclarations = function(defs) {

        var self = this;

        for(var i = 0; i < FIRST_COG_DECLARATIONS.length; i++) {

            var declaration = FIRST_COG_DECLARATIONS[i];
            var list = defs[declaration.name]; // list of declarations of a certain type (data, valve, etc.)
            var method = self[declaration.method]; // constructor method

            for (var j = 0; j < list.length; j++) {
                var def = list[j];
                method.call(self, def); // instantiates and maps blueprint items of current declaration type
            }

        }

    };



    MapItem.prototype._exposeAlloys = function(){

        var scriptData = this.scriptData;
        var alloys =  this.alloys;
        for(var i = 0; i < alloys.length; i++){
            var alloy = alloys[i];
            var alloyName = alloy.name;
            if(alloyName){
                if(scriptData.hasOwnProperty(alloyName))
                    this.throwError("Alloy name is property already defined: " + alloyName);
                scriptData[alloyName] = alloy.scriptData;
            }

        }

    };


    MapItem.prototype._cogBuildDeclarations = function(){

        var self = this;
        var defs = self._declarationDefs;

        if(defs)
            self._cogFirstBuildDeclarations(defs);

        self.scriptData.init();

      //  self.doTemplateBindings();

        if(defs) {

            defs.sensors.forEach(function (def) {
                self._createSensorFromDef3(def);
            });

            defs.writes.forEach(function (def) {
                self.createWrite(def);
            });
            defs.cogs.forEach(function (def) {
                self.createCog(def);
            });
            defs.chains.forEach(function (def) {
                self.createChain(def);
            });
        }

        self.scriptData.start();

    };


    MapItem.prototype.createLink = function(url, name, data, index, key){

        var self = this;
        var mi = new MapItem();

        mi.cogZone = self.cogZone.demandChild();
        //mi.url = url;
        mi.url = mi.resolvedUrl = url;
        mi.itemData = data;
        mi.itemKey = key;
        mi.itemOrder = index;
        mi.parent = self;
        mi.aliasProto = self.aliasFinal;
        mi.scriptData.mapItem = mi;
        self.childMap[mi.uid] = mi;

        mi.url = self._resolveValueFromType(mi.url, mi.urlType);

        //  console.log('LINK:', mi.url, mi.urlType);

        mi.resolvedUrl = self.aliasContext3.resolveUrl(mi.url);

        mi.aliasContext0 = mi.aliasContext1 = mi.aliasContext2 = mi.aliasContext3 =
            resolver.resolveAliasContext(mi.url, self.aliasContext3);

        mi.placeholder = getPlaceholderDiv(); // $('<div style="display: none;"></div>');
        self.targetNode.append(mi.placeholder);

        mi.itemDataLoc = mi.createData({name: name, value: data});

        downloader.downloadFiles(mi.resolvedUrl, mi._cogBecomeUrl.bind(mi));
        return mi;

    };


    MapItem.prototype.createCog = function(def, placeholder){

        var self = this;
        var mi = new MapItem();

        mi.cogZone = def.isRoute ? self.cogZone.demandChild(def.name, def.isRoute) : self.cogZone.demandChild(def.name);

        mi.target = def.target;
        mi.source = def.source;
        mi.sourceType = def.sourceType || 'prop';
        mi.item = def.item;
        mi.itemType = def.itemType;
        mi.name = def.name;
        mi.url =  def.url;
        mi.urlType = def.urlType || 'string';

        //    console.log('COG:', mi.url, mi.urlType);

        mi.parent = self;

        mi.scriptData.mapItem = mi;
        self.childMap[mi.uid] = mi;

        if(mi.urlType !== 'data') {

            mi.url = self._resolveValueFromType(mi.url, mi.urlType);
            mi.resolvedUrl = self.aliasContext3.resolveUrl(mi.url, def.path);
            mi.aliasContext0 = resolver.resolveAliasContext(mi.resolvedUrl, self.aliasContext3);

            if(!placeholder) {

                // if not target node, todo throw error in cog creation stuff to say node not present in template
                mi.placeholder = getPlaceholderDiv();
                mi.targetNode = (self.isPinion) ? self.targetNode : self.scriptData[mi.target];
                mi.targetNode.append(mi.placeholder);

            } else {

                mi.placeholder = placeholder;

            }

            downloader.downloadFiles(mi.resolvedUrl, mi._cogBecomeUrl.bind(mi));

        } else {

            mi.isPinion = true;
            mi.aliasContext0 = mi.aliasContext1 = mi.aliasContext2 = mi.aliasContext3 = self.aliasContext3;
            mi.targetNode = self.scriptData[mi.target];
            mi.cogZone.findData(mi.url).on('update').change().as(mi).host(mi.uid).run(mi._cogReplaceUrl).autorun();

        }

        return mi;

    };


    MapItem.prototype.createChain = function(def){

        var self = this;
        var mi = new MapItem();

        mi.cogZone = self.cogZone.demandChild();
        mi.isChain = true;
        mi.build = def.build;
        mi.order = def.order;
        mi.depth = def.depth;
        mi.source = def.source;
        mi.sourceType = def.sourceType;
        mi.item = def.item;
        mi.itemType = def.itemType;
        mi.target = def.target;
        mi.name = def.name;
        mi.listKey = def.key;
        mi.url =  def.url;
        mi.parent = self;
        mi.scriptData.mapItem = mi;
        self.childMap[mi.uid] = mi;

        mi.targetNode = self.scriptData[mi.target];

        mi.aliasContext0 = mi.aliasContext1 = mi.aliasContext2 = mi.aliasContext3 = self.aliasContext3;

        var resolvedUrl = mi.resolvedUrl = mi.aliasContext0.resolveUrl(def.url);
        downloader.downloadFiles(resolvedUrl, mi._seekListSource.bind(mi));

        return mi;

    };


    MapItem.prototype.createAlloy = function(def) {

        // url must be cached/loaded at this point
        var self = this;

        if(self.destroyed)
            return;

        var alloy = new MapItem();

        alloy.cogZone = def.isRoute ? self.cogZone.demandChild(def.name, def.isRoute) : self.cogZone.demandChild(def.name);

        alloy.origin = self; // cog that hosts this alloy
        alloy.isAlloy = true;
        alloy.name = def.name;
        alloy.isRoute = def.isRoute;

        alloy.source = def.source;
        alloy.sourceType = def.sourceType || 'prop';
        alloy.item = def.item;
        alloy.itemType = def.itemType;

        // insert alloy between this cog and its parent
        alloy.parent = self.parent;
        alloy.parent.childMap[alloy.uid] = alloy;
        delete self.parent.childMap[self.uid];
        self.parent = alloy;
        alloy.childMap[self.uid] = self;

        self.cogZone.insertParent(alloy.cogZone);

        alloy.url = def.url;
        alloy.resolvedUrl = alloy.origin.aliasContext1.resolveUrl(def.url, def.path);
        alloy.aliasContext0 = resolver.resolveAliasContext(def.url, alloy.origin.aliasContext2);

        alloy._cogBecomeUrl();
        return alloy;

    };

    MapItem.prototype.assignParent = function(newParent) {

        var self = this;

        var oldParent = self.parent;
        if(oldParent)
            delete oldParent.childMap[self.uid];
        self.parent = newParent;
        newParent.childMap[self.uid] = self;

    };

    MapItem.prototype._resolveSource = function() {

        if(this.isChain)
            this._chainResolveSource();
        else
            this._cogResolveSource();

    };

    MapItem.prototype._chainResolveSource = function() {

        this.sourceVal = this.parent._resolveValueFromType(this.source, this.sourceType);

        if (this.sourceType === DATA) {

            if (!this.sourceVal) {
                this.throwError('data source: ' + this.source + ' could not be resolved!');
                return;
            }

            this.sourceVal.on('update').as(this).host(this.uid).run(this._refreshListItems).autorun();

        } else {

            if(this.sourceVal === undefined){
                this.throwError('data source: ' + this.source + ' could not be resolved with static type!');
                return;
            }
            this._refreshListItems(this.sourceVal);

        }

    };

    MapItem.prototype._cogResolveSource = function() {

        if(!this.parent)
            return;

        var outerCog = this.parent;
        while (outerCog.parent && outerCog.isAlloy){
            outerCog = outerCog.parent;
        }

        this.sourceVal = (this.sourceType !== DATA && this.isAlloy) ?
            this.origin._resolveValueFromType(this.source, this.sourceType) : // resolve from the declaring cog, not the parent
            outerCog._resolveValueFromType(this.source, this.sourceType);

        this.itemVal = this._resolveValueFromType(this.item, this.itemType, true);

        if(this.itemType === DATA)
            this.itemVal = this.demandData(this.item);

        if (this.sourceType === DATA) {

            if (!this.sourceVal) {
                this.throwError('data source: ' + source + ' could not be resolved!');
                return;
            }

            if(this.itemType === DATA) {
                this.itemVal = this.demandData(this.item);
                this.sourceVal.on('update').as(this).host(this.uid).pipe(this.itemVal).autorun();

                if(typeof this.scriptData.update === 'function')
                    this.itemVal.on('update').as(this).host(this.uid).run(this.scriptData.update).autorun();
            } else {
                var d = this.sourceVal.read();
                if(this.itemType === PROP)
                    this.scriptData[this.item] = d; // todo add error check for prop collision
                else
                    this.throwError('invalid itemType: ' + this.itemType);
            }


        } else {

            if(this.itemType === DATA)
                this.itemVal.write(this.sourceVal);
            else
                this.throwError('invalid itemType: ' + this.itemType);
        }

    };


    MapItem.prototype._seekListSource = function(){

        if(this.destroyed || !this.parent || this.parent.destroyed) return;

        if(this.source){
            this._resolveSource();
        } else {
            this.throwError('chain has no list source defined!');
        }

    };

    MapItem.prototype._generateKeyMapForListDisplay = function(){

        var keyMap = {};
        var childMap = this.childMap;
        for(var id in childMap){
            var mi = childMap[id];
            var itemKey = mi.isAlloy ? mi.origin.itemKey : mi.itemKey;
            keyMap[itemKey] = mi;
        }

        return keyMap;
    };




    MapItem.prototype._refreshListItems = function(arr){


        var url = this.resolvedUrl;
        var listKey = this.listKey;

        var i;

        var remnantKeyMap = this._generateKeyMapForListDisplay();
        var dataKeyMap = {};
        var listItem;

        var itemDataName = this.item;

        for(i = 0; i < arr.length; ++i){ // loop through new set of data

            var d = arr[i];
            var itemKey = (listKey) ? d[listKey] : i; // use index if key not defined
            listItem = remnantKeyMap[itemKey]; // grab existing item if key used before

            var displayItem;
            if(listItem) { // already exists
                displayItem = listItem.isAlloy ? listItem.origin : listItem;
                displayItem.itemDataLoc.write(d);
            } else {
                listItem = this.createLink(url, itemDataName, d, i, itemKey);
                displayItem = listItem.isAlloy ? listItem.origin : listItem;
            }

            //if(this.order)
                //this.parent.localSel.append(displayItem.localSel);

            if(this.order) {
                displayItem.localSel.reparent();
            }

            dataKeyMap[itemKey] = listItem;

        }

        for(var oldKey in remnantKeyMap){
            listItem = remnantKeyMap[oldKey];
            if(!dataKeyMap[oldKey])
                destroyMapItem(listItem);
        }

    };


    function camelCase(str){
        return str.replace( /-([a-z])/ig, function( all, letter ) {
            return letter.toUpperCase();
        } );
    }

    MapItem.prototype._cogBecomeUrl = function(){

        var mi = this;
        if(mi.destroyed || !mi.parent || mi.parent.destroyed) return;

        var url = mi.resolvedUrl;
        var display = mi.display = parser.display(url) && (parser.display(url)).cloneNode(true);
        mi._declarationDefs = parser.blueprint(url);

        var sd = mi.scriptData = parser.script(url);
        sd.mapItem = mi;
        sd.index = mi.itemOrder;
        sd.key = mi.itemKey;

        mi._templates = parser.templates(url);
        mi._boundNodes = {};

        mi.aliasContext1 = resolver.resolveAliasContext(mi.resolvedUrl, mi.aliasContext0, mi._declarationDefs.aliases);

        // expose aliases to scriptData -- todo make this look nicer and use functions
        for(var j = 0; j < mi._declarationDefs.aliases.length; j++){
            var aliasDef = mi._declarationDefs.aliases[j];
            if(aliasDef.prop)
                sd[aliasDef.name] = mi.aliasContext1.aliasMap.map[aliasDef.name];
        }

        mi.aliasContext2 = mi.aliasContext1; // later modified if alloys contain aliases

        if(mi.isAlloy) {
            mi._cogInitialize();
        } else {

            var nodes = display.querySelectorAll('[id]');
            for(var i = 0; i < nodes.length; i++){
                var node = nodes[i];

                if (mi._templates[node.id]) {
                    mi._boundNodes[node.id] = node;
                }

                var cameCaseName = camelCase(node.id);
                sd[cameCaseName] = dom(node);
                node.setAttribute('id', mi.uid + '_' + cameCaseName);
            }

            mi.localSel = dom(display);
            mi._cogRequestRequirements();
        }

    };


    MapItem.prototype._cogReplaceUrl = function(url){

        this.clearContent();

        if(url)
            this.createCog({url: url});

    };

    MapItem.prototype._cogPreInitialize = function(){

        if(this.destroyed || !this.parent || this.parent.destroyed) return;

        var requirements = this._declarationDefs.requires;

        for(var i = 0; i < requirements.length; i++){
            var req = requirements[i];
            var url = req.resolvedUrl;

            if(!libraryMap[url]) { // limits script execution to once per url
                libraryMap[url] = url;
                if(endsWith(url,".js")) {
                    var scriptText = downloader.fileText(url);
                    scriptText = wrapScript(scriptText, url);
                    addScriptElement(scriptText);
                }
            }

        }

        var alloys = this._declarationDefs.alloys;

        for(i = 0; i < alloys.length; i++){

            var def = alloys[i];
            def.url = def.resolvedUrl; // todo remove hack?
            var alloy = this.createAlloy(def);
            this.alloys.push(alloy);
            this.aliasContext2 = this.aliasContext2.addContext(alloy.aliasContext1);

        }

        var valves = this._declarationDefs.valves;

        this.aliasContext3 = valves.length ? this.aliasContext2.modify([], valves) : this.aliasContext2;
        this._cogInitialize();

    };


    MapItem.prototype._cogRequestRequirements = function(){

        var self = this;

        var libs = self._declarationDefs.requires;

        var files = [];
        for(var i = 0; i < libs.length; i++){
            var def = libs[i];
            def.resolvedUrl = self.aliasContext1.resolveUrl(def.url, def.path);
            files.push(def.resolvedUrl);
        }

        downloader.downloadFiles(files, function(status){

            if(status === 'ready') {
                self._cogPreInitialize();
            }
            else
                console.log(self.resolvedUrl + ' failed to load stuff');

        });

    };


    MapItem.prototype._cogInitialize = function(){

        var mi = this;

        if(!mi.isAlloy) {
            mi._exposeAlloys();
        }

        if(mi.placeholder){
            mi.placeholder.replaceWith(mi.display);
            returnPlaceholderDiv(mi.placeholder);
            mi.placeholder = null;
        }


        if(mi.source)
            mi._resolveSource();

        mi._cogBuildDeclarations();

    };



    function addScriptElement(scriptText) {

        var scriptEle = document.createElement("script");
        scriptEle.type = "text/javascript";
        scriptEle.text = scriptText;
        // todo add window.onerror global debug system for syntax errors in injected scripts?
        document.head.appendChild(scriptEle);

        scriptEle.parentNode.removeChild(scriptEle);

    }


    function endsWith(entireStr, ending){
        return (entireStr.lastIndexOf(ending) === (entireStr.length - ending.length) && entireStr.length > ending.length);
    }

    var placeholderDiv = buildPlaceholderDiv();
    var placeholderDivPool = [];

    function getPlaceholderDiv(){
        if(placeholderDivPool.length > 0)
            return placeholderDivPool.pop();
        return dom(placeholderDiv.cloneNode(false));
    }

    function returnPlaceholderDiv(div){
        div.remove();
        placeholderDivPool.push(div);
    }

    function buildPlaceholderDiv(){
        var fragment = document.createDocumentFragment();
        var tmp = fragment.appendChild(document.createElement("div"));
        tmp.innerHTML = '<div style="display: none;"></div>';
        return tmp.firstChild;
    }


    MapItem.prototype.clearContent = function(){
        destroyInnerMapItems(this);
        if(this.localSel){
            console.log('clear issue!!! -- expecting this to be pinion without local content');
        }
    };


    MapItem.prototype.find = function(name, thing, where, optional){

        thing = thing || 'data';
        where = where || 'first';

        var mapNames = {
            data: 'dataMap',
            method: 'methodMap'
        };

        var map = mapNames[thing];
        return this._find(name, map, where, optional);
    };


    MapItem.prototype.createWrite = function(def){
        var mi = this;
        var dataPlace = mi.find(def.name, def.thing, def.where);
        if(!dataPlace)
            mi.throwError("Could not write to: " + def.name + ":" + def.thing + ":" + def.where);
        dataPlace.write(def.value);
    };


    MapItem.prototype.createSensor = function(watch, thing, topic, where){
        thing = thing || 'data';
        topic = topic || 'update';
        where = where || 'first';
        var def = {
            watch: [watch],
            thing: thing,
            topic: topic,
            where: where
        };
        return this._createSensorFromDef3(def);
    };

    MapItem.prototype._senseInteraction = function(nodeId, eventName){

        var self = this;

        var node = self.scriptData[nodeId];
        if (!node) {
            self.throwError("Could not detect interaction, missing node id: " + nodeId);
            return;
        }

        var data = this.demandData('node:' + nodeId);

        var eventHandler = function(event){
            data.write(event, eventName);
        };

        node.on(eventName, eventHandler);

        return data.on(eventName).emit('update');

    };


    MapItem.prototype._createSensorFromDef3 = function(def){

        var mi = this;
        var dataPlace;
        var pipePlace;
        var sensor;

        if(def.find){

            var eventName = def.detect || def.topic;
            var nodeId = def.find;
            sensor = mi._senseInteraction(nodeId, eventName);

        } else {

            dataPlace = mi.cogZone.findData(def.watch, def.where, def.optional);

            if(!dataPlace && def.optional)
                return null;

            sensor = dataPlace.on(def.topic);

        }

        sensor.zone(mi.cogZone);

        var context = mi.scriptData;

        sensor
            .as(context)
            .host(mi.uid);

        if(def.extract){
            sensor.extract(def.extract);
        }

        if(def.adaptPresent){
            sensor.adapt(this._resolveValueFromType(def.adapt, def.adaptType))
        }

        if(def.change)
            sensor.change();

        if (def.filter) {
            var filterMethod = context[def.filter];
            sensor.filter(filterMethod);
        }

        var multiSensor = null;
        if(def.watch.length > 1) {

            multiSensor = sensor;
            sensor = sensor.merge().on(def.topic).batch();

        } else if(def.batch) {
            sensor.batch();
        }


        if(def.transformPresent){
            sensor.transform(this._resolveValueFromType(def.transform, def.transformType))
        }

        if(def.emitPresent){
            sensor.emit(this._resolveValueFromType(def.emit, def.emitType))
        }

        if(def.retain && !def.forget)
            sensor.retain();

        if(def.group && multiSensor) {
            multiSensor.batch();
            sensor.group();
        }

        if(def.keep){
            if(multiSensor)
                multiSensor.keep(def.keep);
            else
                sensor.keep(def.keep);
        }

        if(def.need && def.need.length > 0)
            sensor.need(def.need);

        if(def.gather && def.gather.length > 0)
            sensor.gather(def.gather);

        if(def.pipe) {
            pipePlace = mi.cogZone.findData(def.pipe, def.pipeWhere, def.optional);
            if(pipePlace)
                sensor.pipe(pipePlace);
        } else if(def.toggle){
            var togglePlace = mi.cogZone.findData(def.toggle, def.pipeWhere, def.optional);
            if(togglePlace)
                sensor.run(function(){ togglePlace.toggle();});
        }

        if(def.run && !def.toggle && !def.pipe) {
            var callback = context[def.run];
            sensor.run(callback);
        }

        if(def.once)
            sensor.once();

        if(def.defer)
            sensor.defer();

        if(multiSensor)
            multiSensor.autorun();

        if(def.autorun){
            sensor.autorun();
        }

        return sensor;

    };

    MapItem.prototype.exposeProp = function(name, value){
        var mi = this;
        if(mi.scriptData[name])
            mi.throwError("Prop already defined: "+ name);
        mi.scriptData[name] = value;
    };


    MapItem.prototype.createProp = function(def){

        var mi = this;
        var prop;

        if(def.thing === 'alias'){
            prop = mi.aliasContext2.resolveUrl(def.find);
        } else {
            prop = mi.find(def.find, def.thing, def.where, def.optional);
        }

        if(!prop && def.optional)
            return;

        if(prop === undefined)
            mi.throwError("Could not build Prop: " + def.find + ":" + def.thing + ":" + def.where);

        if(mi.scriptData[def.name])
            mi.throwError("Prop already defined: "+ def.name);

        mi.scriptData[def.name] = prop;

        return prop;

    };

    MapItem.prototype.throwError = function(msg){
        throw new Error("MapItem: " + this.resolvedUrl + ": id: " + this.uid + ": " + msg);
    };

    MapItem.prototype.findMethod = function(name, where){
        return this._find(name, 'methodMap', where);
    };

    MapItem.prototype._find = function(name, map, where, optional) {


        if(map === 'dataMap')
            return this.cogZone.findData(name, where, optional);

        where = where || 'first'; // options: local, parent, first, outer, last

        if(where === 'local')
            return this._findLocal(name, map);
        else if(where === 'first')
            return this._findFirst(name, map);
        else if(where === 'outer')
            return this._findOuter(name, map);
        else if(where === 'last')
            return this._findLast(name, map);
        else if(where === 'parent')
            return this._findFromParent(name, map);
        else
            throw new Error('Invalid option for [where]: ' + where);
    };

    MapItem.prototype._findLocal = function(name, map) {
        return this[map][name];
    };

    MapItem.prototype._findFirst = function(name, map, fromParent) {

        var item = this;
        var checkValve = fromParent;

        do {

            if(checkValve && item.valveMap && item.valveMap[map] && !item.valveMap[map].hasOwnProperty(name))
                return undefined; // not white-listed by a valve on the cog

            checkValve = true; // not checked at the local level (valves are on the bottom of cogs)

            var result = item[map][name];
            if (item[map].hasOwnProperty(name))
                return result;

        } while (item = item.parent);

        return undefined;
    };

    MapItem.prototype._findFromParent = function(name, map) {
        var p = this.parent;
        if(!p) return undefined;
        return p._findFirst(name, map, true);
    };

    MapItem.prototype._findOuter = function(name, map) {

        var item = this;
        var found = false;
        var checkValve = false;

        do {

            if(checkValve && item.valveMap && item.valveMap[map] && !item.valveMap[map].hasOwnProperty(name))
                return undefined; // not white-listed by a valve on the cog

            checkValve = true; // not checked at the local level (valves are on the bottom of cogs)


            var result = item[map][name];
            if (item[map].hasOwnProperty(name)) {
                if (found)
                    return result;
                found = true;
            }
        } while (item = item.parent);

        return undefined;

    };

    MapItem.prototype._findLast = function(name, map) {

        var item = this;
        var result = undefined;
        var checkValve = false;

        do {

            if(checkValve && item.valveMap && item.valveMap[map] && !item.valveMap[map].hasOwnProperty(name))
                return result; // not white-listed by a valve on the cog

            checkValve = true; // not checked at the local level (valves are on the bottom of cogs)

            if (item[map].hasOwnProperty(name))
                result = item[map][name];
        } while (item = item.parent);

        return result;

    };


    MapItem.prototype.doTemplateBindings = function doTemplateBindings (defs) {
        var nodes = this._boundNodes;
        var syntaxPlans = this._templates;

        // null is passed as the context since this function _is already bound_
        // and one can't overwrite the `this` of a function on which `bind` has
        // already been called
        for (var key in syntaxPlans) this.scriptData["_templateBinding_" + key].call(null, this);
    };

    MapItem.prototype.createMethod = function(def){

        var mi = this;
        var method = mi.scriptData[def.func];

        if((typeof method) !== 'function'){
            mi.throwError("Method must be a function: " + def.func);
        }

        method.originalContext = mi.scriptData;

        if(def.bound)
            method = method.bind(method.originalContext);

        return this.methodMap[def.name] = method;

    };

    MapItem.prototype.findData = function(name, where, optional){
        return this._find(name, 'dataMap', where, optional);
    };

    MapItem.prototype.demandData = function(name){
        return this.cogZone.demandData(name);
    };


    MapItem.prototype._resolveValueFromType = function(value, type, demandIt){

        if(!type)
            return value; // assume it is what it is...

        if(type === STRING)
            return value;

        if(type === NUMBER)
            return Number(value);

        if(type === BOOLEAN)
            return (value === true || value === 'true');

        if(type === OBJECT)
            return (typeof value === 'object') ? value : null;

        if(type === DATA)
            return (demandIt) ? this.demandData(value) : this.findData(value);

        if(type === READ) {
            var d = this.findData(value);
            return function() {
                return d.read(); // todo  add error handling?
            }
        }

        var context = this.scriptData;
        if(type === PROP)
            return context[value];

        if(type === RUN)
            return this._resolveRunValue(value, context);

    };

    MapItem.prototype._resolveRunValue = function(value, context){

        var f = context[value];
        if(f && typeof f === 'function'){
            return f.call(context);
        } else {
            var method = this.findMethod(value);
            if (typeof method !== 'function') {
                this.throwError('run method not found!');
                return;
            }
            return method.call(context);
        }
    };

    MapItem.prototype.createAdapter = function(def){

        var z = this.cogZone;
        var data = z.demandData(def.name); // local data point
        var itemName = def.item || (this.parent.isChain ? this.parent.item : this.item); // todo look up why diff on chains - need alloy skip? need pinion check?
        var options = z.findData(itemName).read(); // todo add error crap if this stuff fails

        var fieldName = this._resolveValueFromType(def.field, def.fieldType);
        var externalName = options[fieldName];

        if(!externalName && def.optional) return;

        var externalData = z.findData(externalName, 'parent', def.optional); // name of data point to follow or control

        if(def.control && !externalData && def.bypass)
            externalData = z.demandData(def.bypass);

        if(!externalData) return;

        if(def.control){
            data.on('*').host(this.uid).pipe(externalData);
        } else {
            externalData.on('*').host(this.uid).pipe(data).autorun();
        }

    };

    MapItem.prototype.createData = function(def){

        var self = this;
        var name = def.name;

        //TODO strip colons in user input, so framework can use them as reserved creations
        //if(name.indexOf(":")!=-1)
        //    self.throwError("Invalid data name: " + name);

        var value = def.value;
        var type = def.valueType;
        var inherited = false;


        if (def.inherit) {
            var ancestor = self._find(name, 'dataMap', 'first', true);
            if(ancestor && ancestor.peek()) {
                value = ancestor.read();
                inherited = true;
            }
        }

        if (!inherited)
            value = this._resolveValueFromType(value, type);

        var ghostData;

        if(def.isGhost) { // ghost data only creates a prop (ghost) of an existing point, unless it does not exist
            ghostData = self.cogZone.findData(name, 'first', true);
            if(ghostData){
                if(self.scriptData[def.name])
                    self.throwError("Property already defined: " + def.name);
                self.scriptData[def.name] = ghostData;
                return;
            }
        }

        var data = self.cogZone.demandData(name);

        if(def.prop){
            if(self.scriptData[def.name])
                self.throwError("Property already defined: " + def.name);
            self.scriptData[def.name] = data;
        }

        if(def.name){
            data.tag(def.name);
        }

        if(def.adaptPresent){
            data.adapt(this._resolveValueFromType(def.adapt, def.adaptType))
        }

        if(def.isRoute){
            data.route();
        }

        data.initialize(value); // adapt after this?

        if(def.servicePresent || def.url) {

            var settings = def.servicePresent ? this._resolveValueFromType(def.service, def.serviceType) : {};

            if(typeof settings === 'function')
                settings = settings.call(this);

            settings.url = def.url || settings.url;
            settings.path = def.path || settings.path;
            settings.verb = def.verb || settings.verb || 'GET'; // || global default verb
            settings.params = settings.params || {};


            if(def.paramsPresent) {
                var params = this._resolveValueFromType(def.params, def.paramsType) || {};
                copyProps(params, settings.params);
            }

            var service = new WebService();
            service.init(settings, self, data);
            self.webServiceMap[data._id] = service;
            if(def.request)
                service.request();

        }

        if (def.socket) {

            var settings = this._resolveValueFromType(def.socket, def.socketType);

            if (settings === void 0)
                throw new Error("Sockets must come equiped with settings")

            var sock = new WSocket(settings, self, data);

            self.sockMap[data._id] = sock;
        }

        return data;

    };

    // Arguments :
    //  verb : 'GET'|'POST'
    //  target : an optional opening target (a name, or "_blank"), defaults to "_self"
    MapItem.prototype.postToBlankWindow = function(url, data) {

        var form = document.createElement("form");
        form.action = url;
        form.method = 'POST';
        form.target = '_blank';

        if (data) {
            for (var key in data) {
                var input = document.createElement("textarea");
                input.name = key;
                input.value = typeof data[key] === "object" ? JSON.stringify(data[key]) : data[key];
                form.appendChild(input);
            }
        }

        form.style.display = 'none';
        document.body.appendChild(form);
        form.submit();
        form.parentNode.removeChild(form);

    };


    var WSocket = function WSocket (settings, cog, location) {
        this._cog = cog;
        this._location = location;
        this.settings = settings;

        cognition.plugins.use("tachikoma", this._location);
    }

    WSocket.prototype.send = function send (msg) {
        this._location.write(msg, "send");
    }

    var WebService = function() {

        this._cog = null;
        this._settings = {url: null, params: null, format: 'jsonp', verb: 'GET'};
        this._location = null;
        this._primed = false;
        this._timeoutId = null;

    };

    WebService.prototype.init = function(settings, cog, location){

        function overrideSettings(settings, overrides){
            var result = {};
            copyProps(settings, result);
            copyProps(overrides, result);
            return result;
        }

        this._location = location;

        cognition.plugins.use("ajax", this._location);

        location.on('settings,inline_settings')
            .host(cog.uid)
            .batch()
            .merge('*')
            .batch()
            .group(function(msg,topic){return topic;})
            .retain()
            .transform(function(msg){return overrideSettings(msg.settings, msg.inline_settings)})
            .emit('mixed_settings')
            .pipe(location);

        location.on('mixed_settings')
            .host(cog.uid)
            .batch()
            .filter(function(msg){return msg && msg.request;})
            .transform(function(){ return {}})
            .emit('request')
            .pipe(location);

        location.on('request')
            .host(cog.uid)
            .transform(function(msg){
                var request_settings = (typeof msg === 'object') ? msg : {};
                var mixed_settings = location.read('mixed_settings');
                var final_settings = overrideSettings(mixed_settings, request_settings);
                return final_settings;
            })
            .emit('do_request')
            .pipe(location);

        this._cog = cog;
        this.settings(settings);
        this._location.service(this);

        return this;

    };

    WebService.prototype.settings = function(settings) {

        if(arguments.length === 0)
            return this._settings; // todo copy and freeze object to avoid outside mods?

        this.abort();

        var defaults = copyProps(webServiceDefaults, {});
        settings = copyProps(settings, defaults); // override defaults

        settings.resolvedUrl = this._cog.aliasContext2.resolveUrl(settings.url, settings.path);

        this._settings = settings;

        return this;

    };

    WebService.prototype.abort = function() {

        if(this._primed) {
            clearTimeout(this._timeoutId);
            this._primed = false;
            this._timeoutId = null;
        }

        this._location.write(this._settings, 'abort');

        return this;

    };

    WebService.prototype.params = function(params) {

        if(arguments.length === 0)
            return this._settings.params; // todo copy and freeze objects to avoid outside mods?

        this.abort();

        this._settings.params = params;

        return this;
    };

    WebService.prototype.req = WebService.prototype.request = function(params){

        if(params)
            this.params(params);

        if(!this._primed){
            this._primed = true;
            this._timeoutId = setTimeout(this._runRequest.bind(this),0);
        }

        return this;

    };

    WebService.prototype._runRequest = function(){

        this._primed = false;
        this.abort();

        this._location.write(this._settings, 'request');

        this._location.write('busy', 'condition');

        return this;

    };

})(jQuery, window);
