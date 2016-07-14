/*
 * Copyright 2015 Samsung Electronics Co., Ltd.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var inquirer = require('inquirer');
var utils = require('../lib/utils');
var shelljs = require('shelljs');
var mustache = require('mustache');
var child = require('child_process');
var js2xmlparser =  require('js2xmlparser');

function saveUserConfFile(configPath, webosConf) {
    var userConfData = {};
    if (fs.existsSync(configPath)) {
        userConfData = JSON.parse(fs.readFileSync(configPath));
    }
    userConfData.webos = webosConf;
    fs.writeFileSync(configPath, JSON.stringify(userConfData, null, 2), {
        encoding: 'utf8'
    });
}

function getNextSemVersion(curver) {    // just increase revision
    var tmp = curver.split('.');
    var major = parseInt(tmp[0], 10);
    var minor = parseInt(tmp[1], 10);
    var revision = (parseInt(tmp[2], 10) || 0) + 1;

    return major + '.' + minor + '.' + revision;
}

function generateWebosPackageID() {
    return Math.random().toString(36).substr(2, 10);
}

function getValidWebosConfData(configPath) {
    console.log(configPath);
    if (!(fs.existsSync(configPath))) {
        // userconf.json is not exists
        return null;
    }
    // userconf.json is already exists
    var userConfData = JSON.parse(fs.readFileSync(configPath));

    if (!(userConfData.hasOwnProperty('webos'))) {
        // userconf.json doesn't have webos data
        return null;
    }
    var webosData = userConfData.webos;
    if (typeof webosData.name !== 'string' || webosData.name.length <= 0) {
        // name is invalid
        return null;
    }
    if (typeof webosData.vendor !== 'string' || webosData.vendor.length <= 0) {
        // vendor is invalid
        return null;
    }
    if (typeof webosData.icon !== 'string' || webosData.icon.length <= 0) {
        // icon is invalid
        return null;
    }
    if (typeof webosData.largeicon !== 'string' || webosData.largeicon.length <= 0) {
        // largeicon is invalid
        return null;
    }
    if (!validateWebosVersion(webosData.version)) {
        // version is invalid
        return null;
    }

    return webosData;
}

function validateWebosVersion(version) {
    var tmp = version.split('.'),
        i;
    if (tmp.length !== 3) {
        return false;
    }
    for (i = 0; i < tmp.length; i++) {
        if (isNaN(tmp[i])) {
            return false;
        }
    }

    return i === tmp.length;
}

function confirmUseExistingData(userData, callback) {
    console.log('');
    console.log('      > [ Stored Information ]');
    console.log('      > name        : ' + userData.name);
    console.log('      > version     : ' + userData.version);
    console.log('      > vendor      : ' + userData.vendor);

    var ask = [{
        type: 'confirm',
        name: 'useExisting',
        message: 'Already have \'userconf.json\', Do you want to use this data?'
    }];

    inquirer.prompt(ask, function(answers) {
        callback(!!answers.useExisting);
    });
}

function askUserData(cordovaConf, callback, versionOnly, userData) {
    var ask;
    if(versionOnly) {
        var curVer = userData.version;
        var updateVer = getNextSemVersion(userData.version);
        ask = [{
            type: 'input',
            name: 'version',
            message: 'Current version is ' + curVer + '. Application version: ',
            default: updateVer,
            validate: function(input) {
                return /\d.\d.\d/.test(input) ? true : 'invalid version string for webos platform';
            }
        }];
        inquirer.prompt(ask, function(answers) {
            callback(answers);
        });
    }
    else {
        ask = [{
            type: 'input',
            name: 'name',
            message: 'What\'s the application\'s name?',
            default: cordovaConf.name,
            validate: function(input) {
                return /^[a-zA-Z][^~!\.\;\\\/\|\"\'@\#$%<>^&*\()\-=+_\’\n\t\s]*$/.test(input) ? true : 'invalid name for tizen platform';
            }
        },  {
            type: 'input',
            name: 'version',
            message: 'Application Version (Valid RegExp: /\d./\d./\d)',
            default: cordovaConf.version,
            validate: function(input) {
                return /\d.\d.\d/.test(input) ? true : 'invalid version string for webos platform';
            }
        }, {
            type: 'input',
            name: 'vendor',
            message: 'vendor (default is \'My Company\')',
            default: 'My Company',
            validate: function(input) {
                return typeof(input) === 'string' ? true : 'invalid vendor';
            }
        },{
            type: 'input',
            name: 'icon',
            message: 'Icon path (default is \'img/logo.png\')',
            default: 'img/logo.png',
            validate: function(input) {
                return typeof(input) === 'string' ? true : 'invalid iconpath';
            }
        }, {
            type: 'input',
            name: 'largeicon',
            message: 'LargeIcon path (default is \'img/logo.png\')',
            default: 'img/logo.png',
            validate: function(input) {
                return typeof(input) === 'string' ? true : 'invalid iconpath';
            }
        }];
        inquirer.prompt(ask, function(answers) {
            callback(answers);
        });
    }
}

function prepareDir(dir) {
    mkdirp.sync(dir);
}

module.exports = {
    prepare: function(successCallback, errorCallback, wwwSrc, dest, platformRepos, scripts) {
        console.log('\nStart preparing codes for LG Webos Platform......');

        // file path
        wwwSrc = path.resolve(wwwSrc);
        dest = path.resolve(dest);
        platformRepos = path.resolve(platformRepos);
        var userConfPath = path.join('platforms', 'userconf.json');

        // config
        var cordovaConf = utils.getCordovaConfig();
        var userData = getValidWebosConfData(userConfPath);
        if(userData) {
            confirmUseExistingData(userData, function (useExisting) {
                if(useExisting) {
                    askUserData(cordovaConf, function (data) {
                        userData.version = data.version;
                        buildProject();
                    }, true, userData);
                }
                else {
                    askUserData(cordovaConf, function (data) {
                        userData = data;
                        buildProject();
                    });
                }
            });
        }
        else {
            askUserData(cordovaConf, function (data) {
                userData = data;
                buildProject();
            });
        }

        function buildProject() {
            copySrcToDest() || (errorCallback && errorCallback());
            buildPlatformAdditions() || (errorCallback && errorCallback());
            replaceTemplates() || (errorCallback && errorCallback());
            console.log('Prepared at ' + dest);

            // warning for existing meta tag for csp setting
            var targetFile = path.join(wwwSrc, 'index.html');
            var target = fs.readFileSync(targetFile, {
                encoding: 'utf8'
            });

            if(target.match(/(<meta.*)(http-equiv)(.*=*.)("Content-Security-Policy"|'Content-Security-Policy')/)) {
                console.log('\nWARNING!!!!! REMOVE meta tag for csp setting in the "index.html"');
                console.log('It is not supported in this platform. It would be caused abnormal operation.');
                console.log('Please confirm your file : ' + targetFile);
            }

            saveUserConfFile(userConfPath, userData);
            successCallback && successCallback();
        }

        function copySrcToDest() {
            prepareDir(dest);

            for (var key in scripts) {
                if (scripts.hasOwnProperty(key)) {
                    var to = path.join(dest, key);
                    var from = path.resolve(scripts[key]);
                    shelljs.cp('-f', from, to);
                }
            }

            shelljs.cp('-rf', path.join(wwwSrc, '*'), dest);

            return true;
        }

        function buildPlatformAdditions() {
            shelljs.cp('-rf', path.join(platformRepos, 'www', '*'), dest);
            // hack: copying hidden files(starts with dot) at root('www') to the dest directory.
            // if the dest is not exist, we can copy the platform files without this hack by using this command: cp -rf <PLATFORMREPOS>/www <destDir>
            // But the dest directory has the application files at this moment. So we need to use this hack.
            shelljs.cp('-rf', path.join(platformRepos, 'www', '.*'), dest);
            return true;
        }

        function replaceTemplates() {
            var files = fs.readdirSync(dest);
            for(var i=0; i<files.length; i++) {
                var fileName = files[i];
                if(fileName.match(/\.tmpl$/)) {
                    var tmplFilePath = path.join(dest, fileName);
                    var destFilePath = path.join(dest, fileName.replace(/\.tmpl$/, ''));
                    var template = fs.readFileSync(tmplFilePath, {
                        encoding: 'utf8'
                    });
                    var rendered = mustache.render(template, userData);
                    
                    fs.writeFileSync(destFilePath, rendered, {
                        encoding: 'utf8'
                    });
                    shelljs.rm(path.join(dest, fileName));
                }
            }
            return true;
        }
    },
    build: function(successCallback, errorCallback, data) {
        console.log('\nStart packaging LG Webos TV Platform......');
        var www = data.www || path.join('platforms', 'tv-webos', 'www');
        var dest = data.dest || path.join('platforms', 'tv-tizen', 'build');
        var TEMPORARY_BUILD_DIR = '.buildResult';

        www = path.resolve(www);
        dest = path.resolve(dest);
        child.exec('webos version', function(err, stdout, stderr) {
            if(err) {
                console.log(stderr);
                throw Error('The command \"webos\" failed. Make sure you have the latest Webos SDK installed, and the \"webos\" command (inside the tools/ide/bin folder) is added to your path.');
            }
            console.log(stdout);

            // reference url : https://developer.tizen.org/development/tools/web-tools/command-line-interface#mw_package
            var result = shelljs.exec('tizen cli-config "default.profiles.path=' + path.resolve(data.profilePath) + '"');
            if(result.code) {
                throw Error(result.output);
            }
            result = shelljs.exec('tizen build-web -out ' + TEMPORARY_BUILD_DIR + ' -- "' + path.resolve(www) + '"');
            if(result.code) {
                throw Error(result.output);
            }
            result = shelljs.exec('tizen package --type wgt --sign ' + data.profileName + ' -- ' + path.resolve(path.join(www, TEMPORARY_BUILD_DIR)));
            if(result.code) {
                throw Error(result.output);
            }
            else {
                var packagePath = result.output.match(/Package File Location\:\s*(.*)/);
                if(packagePath && packagePath[1]) {
                    prepareDir(dest);
                    shelljs.mv('-f', packagePath[1], path.resolve(dest));
                    shelljs.rm('-rf', path.resolve(path.join(www, TEMPORARY_BUILD_DIR)));
                    console.log('Package created at ' + path.join(dest, path.basename(packagePath)));
                }
                else {
                    throw Error('Fail to retrieve Package File Location.');
                }
            }
        });
    }
};
