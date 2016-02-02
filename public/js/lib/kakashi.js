/**
 * kakashi.js (v2.0.0)
 *
 * Copyright (c) 2015 Scott Southworth & Contributors
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
 * @authors Scott Southworth @darkmarmot
 *
 */

;(function KAKASHI(){

    "use strict";

    var context = this;
    var Kakashi = {};
    var kakashi = Kakashi;

    var plugins = typeof seele !== 'undefined' && seele;
    if(plugins)
        plugins.register('kakashi', Kakashi, true);
    else
        context.Kakashi = Kakashi; // bind to outer context

    var bus = plugins ? plugins.monolith('catbus') : context.Catbus;
    var loader = plugins ? plugins.monolith('ohmu') : context.Ohmu;

    var tree = bus.demandTree('KAKASHI'); // todo host should be defined within a tree
    var fileContextHash = {}; // by fromFile then by aliasMapId -> value: {id: map_id, aliasMap: {id: #, map: aliasMap}, fromFile: file}
    var uid = 0;
    var pathCache = {}; // urls to url paths cached

    function determinePathFromUrl(url){

        if(!url)
            return null;
        var lastSlashPos = url.lastIndexOf('/');
        if(lastSlashPos === -1)
            return null;
        if(lastSlashPos === 0)
            return '/';
        if(lastSlashPos < url.length - 1 && lastSlashPos > 0)
            url = url.substring(0, lastSlashPos + 1);
        return url;

    }

    function resolveAliasDef(url, path, map){

        url = map[url] || url;

        var raw = (url.indexOf("/") === 0 || url.indexOf("http://") === 0 || url.indexOf("https://") === 0);

        if(raw)
            return url;

        path = (path && map[path]) || path;

        return path ? endsWithSlash(path) + url : url;

    }

    function endsWithSlash(str) {

        var lastChar = str.charAt(str.length - 1);
        return (lastChar === '/') ? str : str + '/';

    }

    function demandAliasContext(resolvedUrl, sourceMap){

        if(!resolvedUrl || !sourceMap)
            return new AliasContext(resolvedUrl, sourceMap);

        var fileContext = demandFileContext(resolvedUrl);
        return fileContext[sourceMap.id] || new AliasContext(resolvedUrl, sourceMap);

    }


    function demandFileContext(resolvedUrl){

        return fileContextHash[resolvedUrl] = fileContextHash[resolvedUrl] || {};

    }


    function createEmptyAliasMap(){

        return {id: ++uid, map: {}};

    }

    var AliasContext = function(resolvedUrl, sourceMap){

        this.id = ++uid;
        this.resolvedUrl = resolvedUrl;
        this.resolvedPath = pathCache[resolvedUrl] = pathCache[resolvedUrl] || determinePathFromUrl(resolvedUrl);
        this.aliasMap = sourceMap || createEmptyAliasMap();
        this.resolvedCache = {}; // map of contextual url or alias -> resolvedUrl
        var fileContext = demandFileContext(resolvedUrl);
        fileContext[this.aliasMap.id] = this;

    };

    AliasContext.prototype.requireFiles = function(files){

    };

    AliasContext.prototype.watchStatus = function(resolvedUrl){
        var name = this.id + ':' + resolvedUrl;
        var data = tree.demandData(name);
        return data.on('update').change();// run as pseudo-promise on status 'ready', 'pending', 'failed'
    };

    AliasContext.prototype.markStatus = function(resolvedUrl, status){
        var name = this.id + ':' + resolvedUrl;
        var data = tree.demandData(name);
        data.write(status);
    };

    AliasContext.prototype.isReady = function(resolvedUrl){
        var name = this.id + ':' + resolvedUrl;
        var data = tree.demandData(name);
        return data.read() === 'ready';
    };

    AliasContext.prototype.resolveUrl = function(url, path){

        var resolvedCache = this.resolvedCache;

        if(!path && resolvedCache[url])
            return resolvedCache[url];

        var raw = (url.indexOf("/") === 0 || url.indexOf("http://") === 0 || url.indexOf("https://") === 0);

        if(raw)
            return resolvedCache[url] = url;

        var result = resolveAliasDef(url, path || this.resolvedPath, this.aliasMap.map);

        if(!path)
            resolvedCache[url] = result;

        return result;

    };

    // remains in same file, absorbs aliases of another context (used to suck flatten alloys from context1 to context2)

    AliasContext.prototype.addContext = function(sourceContext){

        if(sourceContext.aliasMap.id === this.aliasMap.id)
            return this;

        var destContext = demandAliasContext(this.resolvedUrl);
        var sourceMap1 = this.aliasMap.map;
        var sourceMap2 = sourceContext.aliasMap.map;
        var destMap = destContext.aliasMap.map;

        for(var k in sourceMap1){
            destMap[k] = sourceMap1[k];
        }

        for(var k in sourceMap2){
            destMap[k] = sourceMap2[k];
        }

        return destContext;

    };

    // aliases, array of defs {name, path, url}, valves are a hash of white list names (if present)
    AliasContext.prototype.modify = function(aliases, valves){

        if(!aliases && !valves)
            return this;

        var newAliasMap = createEmptyAliasMap();
        var newAliasContext = demandAliasContext(this.resolvedUrl, newAliasMap);

        var newMap = newAliasMap.map;
        var oldMap = this.aliasMap.map;
        var name, i, aliasDef;

        if(!valves){

            // create a copy of the old map
            for(name in oldMap){
                newMap[name] = oldMap[name];
            }
            // apply new aliases over old aliases
            for(i = 0; i < aliases.length; i++){
                aliasDef = aliases[i];
                newMap[aliasDef.name] = newAliasContext.resolveUrl(aliasDef.url, aliasDef.path);
                //resolveAliasDef(aliasDef.url, aliasDef.path || this.resolvedPath, newMap);
            }

            return newAliasContext;

        }

        // create a copy of the old map, restricted to valves

        for(name in oldMap){
            if(valves.hasOwnProperty(name))
                newMap[name] = oldMap[name];
        }
        // apply new aliases over old aliases, also restricted to valves

        for(i = 0; i < aliases.length; i++){
            aliasDef = aliases[i];
            name = aliasDef.name;
            if(valves.hasOwnProperty(name))
                newMap[aliasDef.name] = newAliasContext.resolveUrl(aliasDef.url, aliasDef.path);
                //newMap[name] = resolveAliasDef(aliasDef.url, aliasDef.path || this.resolvedPath, newMap);
        }

        return newAliasContext;


    };


    kakashi.resolveAliasContext = function (fromFile, aliasContext, newAliases, newValves){

        // generate empty context if missing
        var resolvedUrl = this.resolvedUrl = aliasContext ? aliasContext.resolveUrl(fromFile) : fromFile;
        var oldAliasContext = aliasContext ||  demandAliasContext(resolvedUrl);

        // create a new context (or retrieve cache) for this file
        var newAliasContext = demandAliasContext(resolvedUrl, oldAliasContext.aliasMap);

        // modify with valves and aliases if present, otherwise return self
        return newAliasContext.modify(newAliases, newValves);

    };




}).call(this);