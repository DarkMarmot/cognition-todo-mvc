;(function($, window) {

    /**
     * cognition.js (v1.5.3-kakashi)
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

    var uid = 0;

    var COG_ROOT = bus.demandTree('COG_ROOT');

    var buildNum = 'NEED_BUILD_NUM';

    // cognition data types

    var DATA = 'data';
    var NUMBER = 'number';
    var PROP = 'prop';
    var FEED = 'feed';
    var SERVICE = 'service';
    var STRING = 'string';
    var RUN = 'run';
    var BOOLEAN = 'bool';
    var OBJECT = 'object';
    var READ = 'read';


    cognition.buildNum = function(n){
        if(arguments.length == 0) return buildNum;
        buildNum = n;
        return cognition;
    };

    var contentMap = {}; // layout map, built from n-item hierarchy
    var libraryMap = {}; // by resolvedUrl, javascript files processed (don't run again)


    var webServiceDefaults = {

        format: 'jsonp',
        post: false

    };

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
        root.aliasContext1 = root.aliasContext2 = root.aliasContext3 = resolver.resolveAliasContext(url);
        root.aliasMap3 = {id: ++uid, map: {}};
        root.createCog({url:url});
        if(debugUrl)
            root.createCog({url: debugUrl});

    };

    function destroyMapItem(mapItem){

        for(var k in mapItem.childMap){
            var mi = mapItem.childMap[k];
            destroyMapItem(mi);
        }

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
        mapItem.itemPlace = null;
        mapItem.destroyed = true;
        mapItem.requirements = null;

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
        this.serviceMap = {};
        this.feedMap = {};
        this.aliasMap = {};
        this.aliasMap1 = null; // alias map provides alloy loading context
        this.aliasMap2 = null; // alias map provides cog loading context
        this.aliasMap3 = null; // alias map provides valve restricted context for children
        this.dataMap = {};
        this.valveMap = null;
        this.methodMap = {};
        this.childMap = {};
        this.webServiceMap = {};
        this.itemPlace = null;
        this.uid = ++uid;
        this.destroyed = false;
        this.requirements = [];
        this.requirementsSeen = {};
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

    MapItem.prototype.on = function(topic){
        return this.itemPlace.on(topic);
    };


    MapItem.prototype.tell = MapItem.prototype.write= function(msg, topic) {
        this.itemPlace.write(msg, topic);
    };

    MapItem.prototype.destroy = function(){
        destroyMapItem(this);
    };


    function determinePathFromFullUrl(url){
        var lastSlashPos = url.lastIndexOf("/");
        if(lastSlashPos === 0)
            return "/";
        if(lastSlashPos < url.length - 1 && lastSlashPos > 0)
            url = url.substring(0,lastSlashPos + 1);
        return url;
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

    // const
    var FIRST_COG_DECLARATIONS = [

        {name: 'properties', method: 'createProp'},
        {name: 'valves', method: 'createValve'},
        {name: 'aliases', method: 'createAlias'},
        {name: 'adapters', method: 'createAdapter'},
        {name: 'dataSources', method: 'createData'},
        {name: 'commands', method: 'demandData'},
        {name: 'services', method: 'createService'},
        {name: 'feeds', method: 'createFeed'},
        {name: 'methods', method: 'createMethod'}

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

    MapItem.prototype._determineAlloys = function(){

        var cog = this.parent;
        var alloys = [];

        while (cog && cog.isAlloy){
            alloys.unshift(cog);
            cog = cog.parent;
        }

        this.alloys = alloys;

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

        //self._declarationDefs = null;


    };


    MapItem.prototype.createLink = function(url, name, data, index, key){

        var self = this;
        var mi = new MapItem();

        mi.cogZone = self.cogZone.demandChild();
        mi.url = url;
        mi.itemData = data;
        mi.itemKey = key;
        mi.itemOrder = index;
        mi.parent = self;
        mi.aliasProto = self.aliasFinal;
        mi.scriptData.mapItem = mi;
        self.childMap[mi.uid] = mi;


        mi.resolvedUrl = mi._resolveUrl2(url, self.path, self.aliasMap3.map);
        mi.resolvedPath = mi.path = determinePathFromFullUrl(mi.resolvedUrl);

        mi.placeholder = getPlaceholderDiv(); // $('<div style="display: none;"></div>');
        self.targetNode.append(mi.placeholder);

        mi.itemDataLoc = mi.createData({name: name, value: data});

        mi._cogDownloadUrl(mi.url);
        return mi;

    };

    MapItem.prototype.createCog2 = function(def, placeholder){

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
        mi.parent = self;

        mi.scriptData.mapItem = mi;
        self.childMap[mi.uid] = mi;

        if(mi.urlType !== 'data') {

            mi.url = self._resolveValueFromType(mi.url, mi.urlType);

            mi.aliasContext1 = resolver.resolveAliasContext(mi.url, self.aliasContext3, def.aliases);
            mi.resolvedUrl = mi.aliasContext1.resolveURL(mi.url);

            if(!placeholder) {

                mi.placeholder = getPlaceholderDiv();
                mi.targetNode = (self.isPinion) ? self.targetNode : self.scriptData[mi.target];
                mi.targetNode.append(mi.placeholder);

            } else {

                mi.placeholder = placeholder;

            }

            mi._cogDownloadUrl(mi.url);

        } else {

            mi.aliasContext = resolver.resolveAliasContext(mi.url, self.aliasContextFinal || self.aliasContext);
            mi.isPinion = true;
            mi.aliasContext1 = mi.aliasContext2 = mi.aliasContext3 = self.aliasContext3;
            mi.targetNode = self.scriptData[mi.target];
            mi.urlFromPlace = mi.cogZone.findData(mi.url).on('update').change().as(mi).host(mi.uid).run(mi._cogReplaceUrl2).autorun();

        }

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
        mi.urlType = def.urlType || 'string'; // s = string, d = data, p = prop



        mi.path = (def.path) ? self._resolvePath2(def.path, self.aliasMap3.map) : self.path;
        mi.parent = self;

        mi.scriptData.mapItem = mi;
        self.childMap[mi.uid] = mi;

        if(mi.urlType !== 'data') {

            mi.url = self._resolveValueFromType(mi.url, mi.urlType);

            mi.resolvedUrl = mi._resolveUrl2(mi.url, mi.path, self.aliasMap3.map);
            mi.resolvedPath = mi.path = determinePathFromFullUrl(mi.resolvedUrl);

            if(!placeholder) {

                mi.placeholder = getPlaceholderDiv();
                if(!mi.target && !self.targetNode){
                    console.log('error1! -- would need last from localsel??',self, self.resolvedUrl, self.localSel);
                    // was: mi.targetNode = (mi.target) ? self.scriptData[mi.target] : self.localSel.last();
                }
                mi.targetNode = (self.isPinion) ? self.targetNode : (
                    (mi.target) ? self.scriptData[mi.target] : dom(self.localSel.last()[0]));
                mi.targetNode.append(mi.placeholder);
            } else {
                mi.placeholder = placeholder;
            }
            mi._cogDownloadUrl(mi.url);

        } else {


            // todo make a createPinion function for clarity ???
            mi.isPinion = true;
            mi._requirementsLoaded = true;

            if(!mi.target){
                console.log('error! -- would need last from localsel??');
                // was: mi.targetNode = (mi.target) ? self.scriptData[mi.target] : self.localSel.last();
            }

            mi.aliasMap1 = mi.aliasMap2 = mi.aliasMap3 = self.aliasMap3;
            mi.path = self.path;

            mi.targetNode = self.scriptData[mi.target];
            mi.urlFromPlace = mi.cogZone.findData(mi.url).on('update').change().as(mi).host(mi.uid).run(mi._cogReplaceUrl).autorun();

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
        mi.path = (def.path) ? self._resolvePath(def.path) : self.path;
        mi.parent = self;
        mi.aliasProto = mi.aliasFinal = self.aliasFinal; // new aliases can't be defined in a chain
        mi.scriptData.mapItem = mi;
        self.childMap[mi.uid] = mi;

        mi.targetNode = self.scriptData[mi.target];

        mi.aliasMap1 = mi.aliasMap2 = mi.aliasMap3 = self.aliasMap3;
        mi.aliasContext = resolver.resolveAliasContext(mi.url, self.aliasContextFinal || self.aliasContext);

        var resolvedUrl = self._resolveUrl2(def.url, def.path, self.aliasMap1.map);
        var urlPlace = bus.location("n-url:"+resolvedUrl);
        tryToDownload(resolvedUrl);
        urlPlace.on("done").as(mi).host(mi.uid).run(mi._seekListSource).once().autorun();
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
        alloy.aliasContext = resolver.resolveAliasContext(def.url, alloy.origin.aliasContextFinal);
        alloy.resolvedUrl = alloy._resolveUrl2(def.url, self.path, self.aliasMap1.map);
        alloy.resolvedPath = alloy.path = determinePathFromFullUrl(alloy.resolvedUrl);

        alloy._cogBecomeUrl();

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
            var itemKey = mi.itemKey;
            keyMap[itemKey] = mi;
        }

        return keyMap;
    };




    MapItem.prototype._refreshListItems = function(arr){

        var url = this.url;
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

            if(listItem) { // already exists
                listItem.itemDataLoc.write(d);
            } else {
                listItem = this.createLink(url, itemDataName, d, i, itemKey);
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

       // var contextParent = mi.parent.isAlloy ? mi.parent : alloy.origin;

        mi._cogAliasMap1();

        if(mi.isAlloy) {
            mi._cogInitialize();
        } else {


            var nodes = display.querySelectorAll('[id]');
            for(var i = 0; i < nodes.length; i++){
                var node = nodes[i];
                var cameCaseName = camelCase(node.id);
                sd[cameCaseName] = dom(node);
                node.setAttribute('id', mi.uid + '_' + cameCaseName);
            }

            mi.localSel = dom(display);
            mi._cogRequestRequirements();
        }

    };


    // cog first makes alloy loading context (using parent external context + aliases)
    // child / active loading context same if no alloys, from last alloy otherwise
    // external context -- applies valves

    // alloy -- use origin's last alloy context (active loading context)
    // for alloys and libraries, (parent.aliasMap3 or origin.aliasMap1) + locally defined aliases
    MapItem.prototype._cogAliasMap1 = function(){

        var baseAliasMap = (this.isAlloy ? this.origin.aliasMap1 : this.parent.aliasMap3) || {id: ++uid, map: {}};

        var aliasDefs = this._declarationDefs.aliases;
        if(aliasDefs.length === 0){
            this.aliasMap1 = baseAliasMap;
            return;
        }

        var newAliasMap = {id: ++uid, map: {}};

        copyProps(baseAliasMap.map, newAliasMap.map);
        for(var i = 0; i < aliasDefs.length; i++){
            var def = aliasDefs[i];
            var url = this._resolveUrl2(def.url, def.path, newAliasMap.map);
            newAliasMap.map[def.name] = url;
        }

        //console.log('ALIAS_MAP:'+this.resolvedUrl, newAliasMap);
        this.aliasMap1 = newAliasMap;
    };


    // for loading child cogs, local.aliasMap1 + merged aliases of alloys
    MapItem.prototype._cogAliasMap2 = function(){

        if(this.isAlloy || this.isPinion || this.isChain) {
            this.aliasMap2 = this.aliasMap3 = this.aliasMap1;
            return;
        }

        var baseAliasMap = this.aliasMap1;
        var alloys = this.alloys;
        var alloy = null;
        var newAliasMap = null;

        for(var i = 0; i < alloys.length; i++){

            alloy = alloys[i];
            var aliasDefs = alloy._declarationDefs.aliases;

            if(aliasDefs.length !== 0){

                if(!newAliasMap) {
                    newAliasMap = {id: ++uid, map: {}};
                    copyProps(baseAliasMap.map, newAliasMap.map);
                }

                for(var j = 0; j < aliasDefs.length; j++){
                    var def = aliasDefs[j];
                    var url = this._resolveUrl2(def.url, def.path, newAliasMap.map);
                    newAliasMap.map[def.name] = url;
                }

            }
        }

        newAliasMap = newAliasMap || baseAliasMap;
        this.aliasMap2 = this.aliasMap3 = newAliasMap;

    };

    // within child cogs, local.aliasMap2 + local valves to restrict access upwards
    MapItem.prototype._cogAliasMap3 = function(){

    };


    MapItem.prototype._cogReplaceUrl = function(url){

        this.clearContent();

        if(url)
            this.createCog({url: url});

    };


    MapItem.prototype._cogRequestRequirements = function(){

        var self = this;

        var libs = self._declarationDefs.requires;

        for(var i = 0; i < libs.length; i++){
            var def = libs[i];
            def.resolvedUrl = self._resolveUrl2(def.url, def.path, self.aliasMap1.map);
            self._cogAddRequirement(def.resolvedUrl, def.preload, def.name, def.isRoute, def);
        };

        if(self.requirements.length == 0) {
            self._cogInitialize();
        } else {
            self._cogDownloadRequirements();
        }

    };


    MapItem.prototype._cogInitialize = function(){

        var mi = this;

        if(!mi.isAlloy) {
            mi._determineAlloys();
            mi._exposeAlloys();
        }

        mi._cogAliasMap2(); // apply alloy aliases, if any
        //console.log("INIT:" + mi.resolvedUrl + ":" + mi.resolvedPath, mi.aliasMap3.map);

        mi._requirementsLoaded = true;

        if(mi.placeholder){
            mi.placeholder.replaceWith(mi.display);
            returnPlaceholderDiv(mi.placeholder);
            mi.placeholder = null;
        }


        if(mi.source)
            mi._resolveSource();

        mi._cogBuildDeclarations();

    };



    MapItem.prototype._cogRequirementReady = function(urlReady) {

        var req, i, j;
        var self = this;
        var allReady = true; // assertion to disprove
        var match = -1;
        var newReqs = [];
        var newReq;

        for(i = 0; i < self.requirements.length; i++) {
            req = self.requirements[i];
            if(req.url === urlReady && !req.ready) {
                match = i;
                req.ready = true;
                if(endsWith(urlReady,".html")){
                    var libs = parser.blueprint(urlReady).requires;
                    for(j = 0; j < libs.length; j++){
                        var def = libs[j];
                        def.path = def.path || determinePathFromFullUrl(urlReady);
                        var resolvedURL = self._resolveUrl2(def.url, def.path, self.aliasMap1.map);
                        if(self.requirementsSeen[resolvedURL])
                            continue;
                        newReq = createRequirement(resolvedURL, def.preload, urlReady, def.name, def.isRoute, def);
                        newReqs.push(newReq);
                        self.requirementsSeen[resolvedURL] = newReq;
                    }
                    if(newReqs.length > 0)
                        allReady = false;

                }
            }
            allReady = allReady && req.ready;
        }


        for(i = 0; i < newReqs.length; i++){
            newReq = newReqs[i];
            self.requirements.splice(match, 0, newReq); // put new requirements after last match
        }

        for(i = 0; i < newReqs.length; i++){
            newReq = newReqs[i];
            tryToDownload(newReq.url);
            newReq.place.on("done").as(self).host(self.uid).run(self._cogRequirementReady).once().autorun();
        }

        if(self._requirementsLoaded) {
            console.log('ready called but loaded set?');
            return;
        }

        if(!allReady)
            return;

        for(i = 0; i < self.requirements.length; i++){
            req = self.requirements[i];
            var url = req.url;

            if(endsWith(url,".js")) {
                if(!libraryMap[url]) { // limits script execution to once per url
                    libraryMap[url] = url;
                    var scriptText = req.place.read();
                    scriptText = wrapScript(scriptText, url);
                    addScriptElement(scriptText);
                }
            } else if(endsWith(url,".html")) {
                if(!req.preload) {
                    req.def.url = req.url || req.def.url; // todo need to redo all the filedownloads and mgmt
                    self.createAlloy(req.def);
                }
            }
        }

        // check that new requirements are downloaded -- todo optimize all this
        for(i = 0; i < self.requirements.length; i++){
            req = self.requirements[i];
            var status = req.place.peek("status");
            if(!status || !status.msg || !status.msg.done) {
                return; // requirements remain...
            }
        }

        self._cogInitialize();

    };


    function addScriptElement(scriptText) {

        var scriptEle = document.createElement("script");
        scriptEle.type = "text/javascript";
        scriptEle.text = scriptText;
        // todo add window.onerror global debug system for syntax errors in injected scripts?
        document.head.appendChild(scriptEle);

        scriptEle.parentNode.removeChild(scriptEle);

    }

    function createRequirement(requirementUrl, preload, fromUrl, name, isRoute, def){
        var urlPlace = bus.location("n-url:"+requirementUrl);
        return {url: requirementUrl, fromUrl: fromUrl, place: urlPlace, preload: preload, name: name, isRoute: isRoute, def:def};
    }

    // this only adds global js lib requirements currently
    MapItem.prototype._cogAddRequirement = function(requirementUrl, preload, name, isRoute, def) {

        //console.log('add: '+ requirementUrl);
        var self = this;
        var urlPlace = bus.location("n-url:"+requirementUrl);
        var requirement = {url: requirementUrl, fromUrl: self.resolvedUrl, place: urlPlace, preload: preload, name: name, isRoute: isRoute, def: def};

        self.requirements.push(requirement);
        self.requirementsSeen[requirement.url] = requirement;

    };

    MapItem.prototype._cogDownloadRequirements = function() {

        var self = this;
        for(var i = 0; i < self.requirements.length; i++){
            var r = self.requirements[i];
            //console.log('try: '+ r.url);
            tryToDownload(r.url);
            r.place.on("done").as(self).host(self.uid).run(self._cogRequirementReady).once().autorun();
        }

    };



    function tryToDownload(url) {


        var urlPlace = bus.location("n-url:"+url);
        var status = urlPlace.peek("status");

        if(status && (status.msg.active || status.msg.done))
            return; // already downloading or successfully downloaded

        if(!status) {
            urlPlace.write({active: true, errors: 0}, "status");
        } else {
            var newStatus = {active: true, fail: false, errors: status.msg.errors};
            urlPlace.write(newStatus, "status");
        }

        var isHTML = endsWith(url, ".html");
        var suffix = "?buildNum=" + buildNum;

        //console.log("GO DOWNLOAD: " + url);

        $.ajax({url: url + suffix, dataType: "text"})
            .done(function(response, status, xhr ){

                //console.log('got file:'+url);
                urlPlace.write(response);

                if (isHTML)
                    parser.parseFile(url, response);

                urlPlace.write({active: false, done: true}, "status");
                urlPlace.write(url, "done");


            })
            .fail(function(x,y,z){

                var status = urlPlace.peek("status");
                var newStatus = {active: false, fail: true, errors: status.msg.errors + 1};
                urlPlace.write(newStatus, "status");

            });
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


    MapItem.prototype._cogDownloadUrl2 = function (){

        downloader.downloadFiles([this.resolvedUrl]);

        var self = this;
        var urlPlace = bus.location("n-url:"+ self.resolvedUrl);
        tryToDownload(self.resolvedUrl);
        urlPlace.on("done").as(self).host(self.uid).run(self._cogBecomeUrl).once().autorun();

    };


    MapItem.prototype._cogDownloadUrl = function (){

        var self = this;
        var urlPlace = bus.location("n-url:"+ self.resolvedUrl);
        tryToDownload(self.resolvedUrl);
        urlPlace.on("done").as(self).host(self.uid).run(self._cogBecomeUrl).once().autorun();

    };

    MapItem.prototype.clearContent = function(){
        destroyInnerMapItems(this);
        if(this.localSel){
            console.log('clear issue!!! -- expecting this to be pinion without local content');
            // this.localSel.empty();
        }
    };


    MapItem.prototype._resolvePath = function(path){

        if(path)
            path = this.findAlias(path) || path;
        else
            path = this._findPath();

        path = (path) ? this._endWithSlash(path) : "/";
        return path;

    };

    MapItem.prototype._resolveUrl = function(url, path){

        var from = this;
        url = from.findAlias(url) || url;
        path = from._resolvePath(path);
        var raw = (url.indexOf("/")===0 || url.indexOf("http://")===0 || url.indexOf("https://")===0);
        var full =  (path && !raw) ? path + url : url;
        if(full.indexOf("..")===-1)
            return full;
        return from._collapseRelativePath(full);
    };

    MapItem.prototype._resolveUrl2 = function(url, path, map){

        var from = this;
        url = map[url] || url;
        path = from._resolvePath2(path, map);
        var raw = (url.indexOf("/")===0 || url.indexOf("http://")===0 || url.indexOf("https://")===0);
        var full =  (path && !raw) ? path + url : url;
        if(full.indexOf("..")===-1)
            return full;
        return from._collapseRelativePath(full);
    };

    MapItem.prototype._resolvePath2 = function(path, map){

        var actualPath = (path && map[path]) || path || this.resolvedPath;
        actualPath = actualPath ? this._endWithSlash(actualPath) : "/";
        return actualPath;

    };

    MapItem.prototype._collapseRelativePath = function(url){

        var parts = url.split("/");
        var remnants = [];

        while(parts.length > 0) {
            var chunk = parts.shift();
            if(chunk !== ".."){
                remnants.push(chunk);
            } else if(remnants.length > 0) {
                remnants.pop();
            }
        }
        return remnants.join("/");

    };

    MapItem.prototype._endWithSlash = function(str) {
        var lastChar = str.charAt(str.length-1);
        if(lastChar === "/") return str;
        return str + "/";
    };

    MapItem.prototype._findPath = function(){
        var item = this;
        do{
            if(item.path) // && !item.isAlloy)// && !item.library)
                return item.path;
            item = item.parent;
        } while(item);
        return undefined;
    };


    MapItem.prototype.find = function(name, thing, where, optional){

        thing = thing || 'data';
        where = where || 'first';

        var mapNames = {
            data: 'dataMap',
            feed: 'feedMap',
            service: 'serviceMap',
            alias: 'aliasMap',
            method: 'methodMap'
        };

        var map = mapNames[thing];
        return this._find(name, map, where, optional);
    };


    MapItem.prototype.createAlias = function(def){
        var url = this.aliasMap[def.name] = this._resolveUrl2(def.url, def.path, this.aliasMap1.map);
        if(def.prop)
            this.exposeProp(def.name, url);
        return url;
    };

    MapItem.prototype.createValve = function(def){

        var valveMap = this.valveMap = this.valveMap || {dataMap: null, aliasMap: null};
        var thingKey = def.thing + 'Map';
        var accessHash = valveMap[thingKey] = valveMap[thingKey] || {};
        for(var i = 0; i < def.allow.length; i++){
            var allowKey = def.allow[i];
            accessHash[allowKey] = true;
        }
        return accessHash;

    };


    MapItem.prototype.createWrite = function(def){
        var mi = this;
        var dataPlace = mi.find(def.name, def.thing, def.where);
        if(!dataPlace)
            mi.throwError("Could not write to: " + def.name + ":" + def.thing + ":" + def.where);
        dataPlace.write(def.value);
    };


    MapItem.prototype.createFeed = function(def){

        var mi = this;
        var feed = new Feed();
        feed.init(def, mi);

        return feed;

    };


    MapItem.prototype.createService = function(def){

        var mi = this;
        var service = new Service();
        service.init(def, mi);

        return service;

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
        var sel = this.scriptData[nodeId];
        if (!sel) {
            self.throwError("Could not detect interaction, missing sel id: " + nodeId);
            return;
        }

        return sel.detect(eventName);

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
        var prop = mi.find(def.find, def.thing, def.where, def.optional);

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

    MapItem.prototype.findService = function(name, where){
        return this._find(name, 'serviceMap', where);
    };

    MapItem.prototype.findFeed = function(name, where){
        return this._find(name, 'feedMap', where);
    };

    MapItem.prototype.findData = function(name, where, optional){
        return this._find(name, 'dataMap', where, optional);
    };

    MapItem.prototype.findAlias = function(name, where){
        return this._find(name, 'aliasMap', where);
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

        if(type === FEED)
            return this.findFeed(value);

        if(type === SERVICE)
            return this.findService(value);

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

        if(!externalData) return;


        if(def.control){
            data.on('*').pipe(externalData);
        } else {
            externalData.on('*').pipe(data).autorun();
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

        var data = self.cogZone.demandData(name);
        //var data = self.dataMap[name] = bus.location("n-data:"+self.uid+":"+name);

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

    function extractDefaultFeedDefFromServiceDef(def){
        return {
            name: def.name,
            to: def.to,
            service: def.name
        };
    }

    var Service = function(){

        this._mapItem = null;
        this._name = null;
        this._url = null;
        this._settings = null;
        this._defaultFeed = null;

    };

    Service.prototype.init = function(def, mi) {

        var service = mi.serviceMap[def.name] = this;

        service._mapItem = mi;
        service._name = name;

        var resolvedUrl = mi._resolveUrl(def.url, def.path);
        //var ruu = mi._resolveUrl2(def.url, def.path, mi.aliasMap2.map);
        var settings = {};
        settings.type = (def.post) ? 'POST' : 'GET';
        settings.dataType = def.format;
        service.url(resolvedUrl).settings(settings);

        // create default feed
        var feedDef = extractDefaultFeedDefFromServiceDef(def);
        service._defaultFeed = mi.createFeed(feedDef);

        if(def.run)
            service.run(def.run);

        if(def.prop)
            mi.exposeProp(def.name, service);

        if(def.request)
            service.request();

        return service;

    };


    Service.prototype.name = function(){
        return this._name;
    };


    Service.prototype.url = function(url){
        if(arguments.length==0) return this._url;
        this._url = url;
        return this;
    };

    Service.prototype.settings = function(settings){
        if(arguments.length==0) return this._settings;
        this._settings = settings;
        return this;
    };

    Service.prototype.to = Service.prototype.data = function(dataPlace) {
        return this._defaultFeed.to(dataPlace);
    };

    Service.prototype.req = Service.prototype.request = function() {
        return this._defaultFeed.request();
    };

    Service.prototype.run = function(callbackName){
        console.log("NOT READY!!!!!");
    };

    Service.prototype.params = function(params) {
        return this._defaultFeed.params(params);
    };

    Service.prototype.parse = function(parseFunc) {
        return this._defaultFeed.parse(parseFunc);
    };


    var WebService = function() {

        this._cog = null;
        this._settings = {url: null, params: null, format: 'jsonp', verb: 'GET'};
        this._location = null;
        this._primed = false;
        this._xhr = null;
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

        location.on('settings,inline_settings').host(cog.uid).batch().merge('*').batch().group(function(msg,topic){return topic;}).retain().
            transform(function(msg){return overrideSettings(msg.settings, msg.inline_settings)}).emit('mixed_settings').pipe(location);

        location.on('mixed_settings').host(cog.uid).batch()
            .filter(function(msg){return msg && msg.request;}).transform(function(){ return {}}).emit('request').pipe(location);

        location.on('request').host(cog.uid).transform(

            function(msg){
                var request_settings = (typeof msg === 'object') ? msg : {};
                var mixed_settings = location.read('mixed_settings');
                var final_settings = overrideSettings(mixed_settings, request_settings);
                return final_settings;
            }).emit('do_request').pipe(location);

        location.on('request').batch().run(function(msg){console.log('REQUEST SETTINGS:', msg);});

        this._cog = cog;
        this.settings(settings);
        this._location.service(this);

        return this;

    };

    WebService.prototype.settings = function(settings) {


        if(arguments.length==0)
            return this._settings; // todo copy and freeze object to avoid outside mods?

        this.abort();

        var defaults = copyProps(webServiceDefaults, {});
        settings = copyProps(settings, defaults); // override defaults

        settings.resolvedUrl = this._cog._resolveUrl(settings.url, settings.path);
        //var huu = this._cog._resolveUrl2(settings.url, settings.path, this._cog.aliasMap2.map);
        this._settings = settings;

        return this;

    };

    WebService.prototype.abort = function() {

        if(this._primed) {
            clearTimeout(this._timeoutId);
            this._primed = false;
            this._timeoutId = null;
        }

        if(this.isActive()){
            this._xhr.abort();
            this._location.write(this._settings, 'abort');
        }

        return this;

    };

    WebService.prototype.isActive = function(){

        return this._xhr && this._xhr.readyState && this._xhr.readyState != 4;

    };


    WebService.prototype.params = function(params) {

        if(arguments.length==0)
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

        var self = this;
        self._primed = false;

        self.abort(); // this should not be needed, possible sanity check

        self._location.write(self._settings, 'request');
        self._location.write('busy', 'condition');

        var settings = {};

        settings.data = self._settings.params;
        settings.url = self._settings.resolvedUrl;
        settings.type = self._settings.verb || 'GET';
        settings.dataType = self._settings.format;

        self._xhr = $.ajax(settings)
            .done(function(response, status, xhr ){

                self._location.write(response);
                self._location.write(response, 'done');
                self._location.write(response, 'always');
                self._location.write(status, 'status');
                self._location.write('done', 'condition');

            })
            .fail(function(xhr, status, error){

                self._location.write(error, 'error');
                self._location.write(error, 'always');
                self._location.write(status, 'status');
                self._location.write('error', 'condition');

            })
        ;
        return self;
    };


    var Feed = function() {

        this._mapItem = null;
        this._name = null;
        this._service = null;
        this._feedPlace = null;
        this._dataPlace = null;
        this._params = null;
        this._primed = false;
        this._uid = ++uid;

    };

    Feed.prototype.init = function(def, mi){

        var feed = mi.feedMap[def.name] = this;
        var service = feed._service = mi.findService(def.service);

        var dataName = def.to || def.service;

        feed._mapItem = mi;
        feed._name = def.name;
        feed._feedPlace = bus.location("n-feed:" + mi.uid + ":"+ def.name);
        feed._dataPlace = mi.demandData(dataName);
        feed._params = null;
        feed._primed = false; // once a request is made, executed on next js frame to allow easy batching, avoid multiple calls

        if(def.prop) {
            mi.exposeProp(def.name, feed);
            if(dataName !== def.name)
                mi.exposeProp(dataName, feed._dataPlace);
        }

        if(def.request)
            feed.request();

    };

    Feed.prototype.on = function(name){
        return this._feedPlace.on(name);
    };



    Feed.prototype.to = Feed.prototype.data = function(dataPlace){
        if(arguments.length==0) return this._dataPlace;
        // todo if changing target, fire feed.detach event
        if(!dataPlace && this._name){
            // TODO is this old format and broken???
            dataPlace = this.mapItem.createData(this._name); // create data named after the feed
        }

        if((typeof dataPlace) === 'string')
            dataPlace = this.mapItem.findData(dataPlace);

        if(!dataPlace){
            console.log("INVALID DATA pointed to by feed!");
            return null;
        }
        this._dataPlace = dataPlace;
        this._dataPlace.write(this,"attach");
        return this._dataPlace;
    };

    Feed.prototype.params = function(params){
        if(arguments.length==0) return this._params;
        this._params = params;
        //this._determineParamsKey();
        return this;
    };

    Feed.prototype.parse = function(parseFunc){
        // TODO if not typeof func, error
        this._parse = parseFunc;
        return this;
    };

    function createResponseInfo(){
        return {
            response: null,
            status: null,
            xhr: null,
            error: null,
            feed: null,
            parsed: null
        };
    }

    Feed.prototype.req = Feed.prototype.request = function(){
        if(!this._primed){
            this._primed = true;
            setTimeout(this._runRequest.bind(this),0);
        }
        return this;
    };

    Feed.prototype._runRequest = function(){

        var self = this;
        self._primed = false;

        // abort any prior running request using this feed object
        var running = self._xhr && self._xhr.readyState && self._xhr.readyState != 4;
        if(running) {
            self._xhr.abort();
        }

        var info = createResponseInfo();
        info.params = self._params;
        info.feed = self;

        self._feedPlace.write(info, "request");
        if(self._dataPlace)
            self._dataPlace.write(info, "request");

        var settings = self._service._settings;
        settings.data = self._params;
        settings.url = self._service._url;

        self._xhr = $.ajax(settings)
            .done(function(response, status, xhr ){
                info.response = response;
                info.parsed = (self._parse) ? self._parse(response) : response;
                info.status = status;
                info.xhr = xhr;
                info.error = null;

                self._feedPlace.write(info, "done");
                self._feedPlace.write(info, "always");
                if(self._dataPlace)
                    self._dataPlace.write(info.parsed);

            })
            .fail(function(xhr, status, error){
                info.response = null;
                info.status = status;
                info.xhr = xhr;
                info.error = error;
                self._feedPlace.write(info, "fail");
                self._feedPlace.write(info, "always");
                if(self._dataPlace)
                    self._dataPlace.write(info, "error");
            })
        ;
        return self;
    };




})(jQuery, window);
