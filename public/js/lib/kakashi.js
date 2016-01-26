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
    var tree = bus.demandTree('KAKASHI'); // todo host should be defined within a tree
    var fileContextHash = {}; // by fromFile then by aliasMapId -> value: {id: map_id, aliasMap: {id: #, map: aliasMap}, fromFile: file}
    var uid = 0;

    function determinePathFromUrl(url){

        var lastSlashPos = url.lastIndexOf('/');
        if(lastSlashPos === 0)
            return '/';
        if(lastSlashPos < url.length - 1 && lastSlashPos > 0)
            url = url.substring(0, lastSlashPos + 1);
        return url;

    }


    function resolveAliasDef(url, path, map){

        url = map[url] || url;
        path = (path && map[path]) || path;

        return path ? endsWithSlash(path) + url : url;

    }

    function endsWithSlash(str) {

        var lastChar = str.charAt(str.length - 1);
        return (lastChar === '/') ? str : str + '/';

    }

    function demandAliasContext(fromFile, sourceMap){

        if(!fromFile || !sourceMap)
            return new AliasContext(fromFile, sourceMap);

        var fileContext = demandFileContext(fromFile);
        return fileContext[sourceMap.id] || new AliasContext(fromFile, sourceMap);

    }


    function demandFileContext(fromFile){

        return fileContextHash[fromFile] = fileContextHash[fromFile] || {};

    }


    function createEmptyAliasMap(){

        return {id: ++uid, map: {}};

    }

    var AliasContext = function(fromFile, sourceMap){

        this.id = ++uid;
        this.fromFile = fromFile;
        this.aliasMap = sourceMap || createEmptyAliasMap();
        this.resolvedCache = {}; // map of contextual url or alias -> resolvedUrl
        var fileContext = demandFileContext(fromFile);
        fileContext[this.aliasMap.id] = this;

    };

    AliasContext.prototype.watchStatus = function(resolvedUrl){
        var name = this.id + ':' + resolvedUrl;
        var data = tree.demandData(name);
        return data.on('update').change().once();// run as pseudo-promise on status 'ready' or 'failed'
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

    AliasContext.prototype.resolveUrl = function(url){

        var cache = this.resolvedCache;

        if(cache[url])
            return cache[url];

        var raw = (url.indexOf("/") === 0 || url.indexOf("http://") === 0 || url.indexOf("https://") === 0);

        if(raw)
            return cache[url] = url;

        var path = determinePathFromUrl(url);

        var result = resolveAliasDef(url, path, this.aliasMap.map);

        return cache[url] = result;

    };

    // aliases, array of defs {name, path, url}, valves are a hash of white list names (if present)
    AliasContext.prototype.modify = function(aliases, valves){

        if(!aliases && !valves)
            return this;

        var newAliasMap = createEmptyAliasMap();
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
                newMap[aliasDef.name] = resolveAliasDef(aliasDef.url, aliasDef.path, newMap);
            }

            return demandAliasContext(this.fromFile, newAliasMap);

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
                newMap[name] = resolveAliasDef(aliasDef.url, aliasDef.path, newMap);
        }

        return demandAliasContext(this.fromFile, newAliasMap);


    };


    kakashi.resolveAliasContext = function (fromFile, aliasContext, newAliases, newValves){

        // generate empty context if missing
        var oldAliasContext = aliasContext ||  demandAliasContext(fromFile);

        // create a new context (or retrieve cache) for this file
        var newAliasContext = demandAliasContext(fromFile, oldAliasContext.aliasMap);

        // modify with valves and aliases if present
        return newAliasContext.modify(newAliases, newValves);

    };


}).call(this);