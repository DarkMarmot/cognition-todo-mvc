/**
 * ohmu.js (v2.0.0)
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

;(function(){

    "use strict";

    var context = this;
    var Ohmu = {};

    var plugins = typeof seele !== 'undefined' && seele;
    if(plugins)
        plugins.register('ohmu', Ohmu, true);
    else
        context.Ohmu = Ohmu; // bind to outer context

    var ohmu = Ohmu;
    var bus = plugins ? plugins.monolith('catbus') : context.Catbus;

    var tree = bus.demandTree('OHMU'); // todo host should be defined within a tree

    var fileStatusZone = tree.demandChild('fileContent'); // name is file, topics: update
    var fileTextHash = {}; // files already loaded are here as key file, value text

    var fileErrorHash = {}; // array of errors by file if present
    var suffixOnRequests = '';

    var isReady = function(msg){ return msg === 'ready';};
    var isFailed = function(msg){ return msg === 'failed';};

    var uid = 0;

    ohmu.fileText = function(file){
        return fileTextHash[file];
    };

    ohmu.fileErrors = function(file){
        return fileErrorHash[file];
    };

    ohmu.downloadFiles = function ohmu_downloadFiles(files, success, failure){ // array of resolved urls

        var incompleteFiles = [];

        for(var i = 0; i < files.length; i++){
            var f = files[i];
            if(!fileTextHash.hasOwnProperty(f)) {
                incompleteFiles.push(f);
                download(f);
            }
        }

        if(incompleteFiles.length === 0){
            success();
        }

        var batchId = ++uid + ':ohmu';
        var batchStatus = tree.demandData('ohmuBatch');
        batchStatus.write('new', batchId);

        var batchSensor = batchStatus.on(batchId).change();
        var dropSensor = batchStatus.on(batchId).change().filter(isReady).batch().run(
            function(){
                console.log('dropping:', batchId);
                bus.dropHost(batchId);
            }
        );





        var fileContent = fileStatusZone.demandData(incompleteFiles);

        var filesReady = fileContent.on('status').filter(isReady).batch().host(batchId);

        var allFilesReady = filesReady.merge('status').group().batch().need(incompleteFiles)
            .emit(batchId).transform('ready').pipe(batchStatus).host(batchId);

        var someFileFailed = fileContent.on('status').filter(isFailed)
            .emit(batchId).transform('failed').pipe(batchStatus).host(batchId);


        filesReady.auto();
        allFilesReady.auto();

        return batchSensor;

    };


    function download(file){

        var data = fileStatusZone.demandData(file);

        if(!data.read('status')) {
            data.write('new','status');
            fileTextHash[file] = null;
            fileErrorHash[file] = null;
            tryDownload(file);
        }

    }


    ohmu.suffix = function suffix(suffix){
        suffixOnRequests = suffix;
    };


    function tryDownload(file){

        var data = fileStatusZone.demandData(file);

        $.ajax({url: file + suffixOnRequests, dataType: "text"})
            .done(function(response, status, xhr ){

                fileTextHash[file] = response;
                data.write('ready', 'status');

            })
            .fail(function(err){

                var errors = fileErrorHash[file] = fileErrorHash[file] || [];
                errors.push(err && err.responseText);

                var status = errors.length > 3 ? 'failed' : 'error';
                data.write(status, 'status');

                if(status === 'error')
                    retryDownload(file);

            });
    }

    function retryDownload(file){

        var error_count = (fileErrorHash[file] || []).length;
        var delay = error_count * error_count * 10;
        setTimeout(function(){
            tryDownload(file);
        }, delay);

    }


}).call(this);