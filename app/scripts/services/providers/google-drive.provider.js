/*File: dropbox.provider.js
 *
 * Copyright (c) 2013-2016
 * Centre National d’Enseignement à Distance (Cned), Boulevard Nicephore Niepce, 86360 CHASSENEUIL-DU-POITOU, France
 * (direction-innovation@cned.fr)
 *
 * GNU Affero General Public License (AGPL) version 3.0 or later version
 *
 * This file is part of a program which is free software: you can
 * redistribute it and/or modify it under the terms of the
 * GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public
 * License along with this program.
 * If not, see <http://www.gnu.org/licenses/>.
 *
 */

'use strict';

angular.module('cnedApp').factory('GoogleDriveProvider',
    function ($http, $q, _, FileConstant) {

        var baseUrl = 'https://www.googleapis.com/drive/v3/';
        var uploadUrl = 'https://www.googleapis.com/upload/drive/v3/';


        function buildTree(arr) {
            var indexed = _.reduce(arr, function (result, item) {
                result[item.id] = item;
                return result;
            }, {});

            // retain the root items only
            var result = _.filter(arr, function (item) {

                // get parent
                var parent = indexed[item.parent];

                // make sure to remove unnecessary keys
                delete item.parent;

                // has parent?
                if (parent) {
                    // add item as a child
                    parent.content = (parent.content || []).concat(item);
                }

                // This part determines if the item is a root item or not
                return !parent;
            });


            return result;
        }


        /**
         * Converts the format of google files  in an internal file format
         * @param googleFiles google files
         * @param type
         * @returns {Array} File list
         */
        var transformGoogleFilesToStorageFiles = function (googleFiles, type) {
            var res = [];

            _.forEach(googleFiles, function (value) {
                res.push(transformGoogleFileToStorageFile(value));
            });

            return buildTree(res);
        };

        /**
         * Converts the format of a google file  in an internal file format
         * @param googleFile a google file
         * @returns {{filename, dateModification: *, type: string, provider: string, content: Array}}
         */
        var transformGoogleFileToStorageFile = function (googleFile) {
            var filenameStartIndex = googleFile.name.indexOf('_') + 1,
                filenameEndIndex = googleFile.name.lastIndexOf('_'),
                filename = filenameStartIndex > 0 && filenameEndIndex > -1 ? googleFile.name.substring(filenameStartIndex, filenameEndIndex) : googleFile.name;

            var file = {
                id: googleFile.id,
                filename: decodeURIComponent(filename),
                dateModification: googleFile.modifiedTime ? new Date(googleFile.modifiedTime) : '',
                mimeType: googleFile.mimeType,
                type: '',
                provider: 'google-drive',
                parent: googleFile.parents && googleFile.parents.length > 0 ? googleFile.parents[0] : null,
                parents: googleFile.parents,
                url: googleFile.webContentLink,
                content: []
            };


            if (googleFile.mimeType === 'application/vnd.google-apps.folder') {
                file.type = 'folder';
            } else {
                file.type = 'file';
            }

            return file;
        };

        var downloadService = function (fileId, access_token) {
            var deferred = $q.defer();
            $http({
                method: 'GET',
                url: baseUrl + 'files/' + fileId + '?alt=media',
                headers: {
                    'Authorization': 'Bearer ' + access_token
                }
            }).then(function (res) {
                deferred.resolve(res.data !== 'null' ? res.data : '');
            }, function (err) {
                deferred.reject(err);
            });

            return deferred.promise;
        };
        var uploadService = function (file, type, access_token) {
            var deferred = $q.defer();

            var contentType = FileConstant.MIME_TYPE[type] || 'application/octet-stream';

            if (file.id && file.id !== -1) {

                $http({
                    method: 'PATCH',
                    url: uploadUrl + 'files' + '/' + file.id,
                    params: {
                        uploadType: 'media'
                    },
                    data: file.data,
                    headers: {
                        'Authorization': 'Bearer ' + access_token,
                        'Content-Type': contentType
                    }
                }).then(function (res) {
                    deferred.resolve(transformGoogleFileToStorageFile(res.data));
                }, function (data) {
                    deferred.reject(data);
                });

            } else {
                var boundary = '-------314159265358979323846';
                var delimiter = "\r\n--" + boundary + "\r\n";
                var close_delim = "\r\n--" + boundary + "--";


                var reader = new FileReader();


                reader.readAsBinaryString(new Blob([file.data], {
                    type: FileConstant.MIME_TYPE[type]
                }));

                reader.onload = function () {


                    var metadata = {
                        'name': file.filename,
                        'mimeType': contentType
                    };

                    if (file.folder) {
                        metadata.parents = [file.folder.id];
                    }

                    var data = reader.result;

                    if (type === FileConstant.TYPE.profile) {
                        data = JSON.stringify(file.data);
                    }

                    var base64Data = btoa(data);
                    var multipartRequestBody =
                        delimiter +
                        'Content-Type: application/json\r\n\r\n' +
                        JSON.stringify(metadata) +
                        delimiter +
                        'Content-Type: ' + contentType + '\r\n' +
                        'Content-Transfer-Encoding: base64\r\n' +
                        '\r\n' +
                        base64Data +
                        close_delim;

                    $http({
                        method: 'POST',
                        url: uploadUrl + 'files',
                        data: multipartRequestBody,
                        params: {'uploadType': 'multipart'},
                        headers: {
                            'Authorization': 'Bearer ' + access_token,
                            'Content-Type': 'multipart/mixed; boundary="' + boundary + '"'
                        },
                        transformRequest: angular.identity
                    }).then(function (res) {
                        deferred.resolve(transformGoogleFileToStorageFile(res.data));
                    }, function (data) {
                        deferred.reject(data);
                    });


                };
            }


            return deferred.promise;
        };
        var deleteService = function (fileId, access_token) {
            var deferred = $q.defer();
            $http({
                method: 'DELETE',
                url: baseUrl + 'files/' + fileId,

                headers: {
                    'Authorization': 'Bearer ' + access_token,
                    'Content-Type': 'application/json'
                }
            }).then(function () {
                deferred.resolve();
            }, function (err) {
                deferred.reject(err);
            });

            return deferred.promise;
        };
        var searchService = function (query, access_token, type) {
            var deferred = $q.defer();
            $http({
                method: 'GET',
                url: baseUrl + 'files',
                params: {
                    q: query,
                    pageSize: 1000,
                    fields: 'files(id, name, modifiedTime, parents, mimeType, webContentLink)'
                },
                headers: {
                    'Authorization': 'Bearer ' + access_token,
                    'Content-Type': 'application/json'
                }
            }).then(function (res) {

                if (res.data && res.data.files) {
                    deferred.resolve(transformGoogleFilesToStorageFiles(res.data.files, type));
                } else {
                    deferred.resolve([]);
                }

            }, function (err) {
                deferred.reject(err);
            });
            return deferred.promise;
        };


        var shareLinkService = function (file, access_token) {
            var deferred = $q.defer();
            $http({
                method: 'POST',
                url: baseUrl + 'files/' + file.id + '/permissions',
                data: {
                    role: 'reader',
                    type: 'anyone'
                },
                headers: {
                    'Authorization': 'Bearer ' + access_token,
                    'Content-Type': 'application/json'
                }
            }).then(function (res) {

                deferred.resolve({
                    url: file.url
                })
            }, function (err) {
                deferred.reject(err);

            });
            return deferred.promise;
        };

        var renameService = function (file, newName, access_token) {
            var deferred = $q.defer();

            $http({
                method: 'PATCH',
                url: baseUrl + 'files/' + file.id,
                data: {
                    name: newName
                },
                headers: {
                    'Authorization': 'Bearer ' + access_token
                }
            }).then(function (res) {
                deferred.resolve(transformGoogleFileToStorageFile(res.data));
            }, function (data) {
                deferred.reject(data);
            });

            return deferred.promise;
        };


        var patchService = function (file, data, params, access_token) {
            var deferred = $q.defer();

            $http({
                method: 'PATCH',
                url: baseUrl + 'files/' + file.id,
                params: params,
                data: data,
                headers: {
                    'Authorization': 'Bearer ' + access_token
                }
            }).then(function (res) {
                deferred.resolve(transformGoogleFileToStorageFile(res.data));
            }, function (data) {
                deferred.reject(data);
            });

            return deferred.promise;
        };

        var authService = function () {
            window.location.href = '/auth/google-drive';
        };

        var copyService = function (originalFile, destinationFile, access_token) {
            var deferred = $q.defer();

            $http({
                method: 'POST',
                url: baseUrl + 'files/' + originalFile.id + '/copy',
                data: {
                    name: destinationFile.filename
                },
                headers: {
                    'Authorization': 'Bearer ' + access_token,
                    'Content-Type': 'application/json'
                }
            }).then(function () {
                deferred.resolve();
            }, function () {
                // Error
                deferred.reject();
            });
            return deferred.promise;
        };

        var createFolderService = function (folderName, access_token) {
            var deferred = $q.defer();

            $http({
                method: 'POST',
                url: baseUrl + 'files',
                data: {
                    name: folderName,
                    mimeType: 'application/vnd.google-apps.folder',
                    modifiedTime: new Date().toISOString()
                },
                headers: {
                    'Authorization': 'Bearer ' + access_token
                }
            }).then(function (res) {
                deferred.resolve(transformGoogleFileToStorageFile(res.data));
            }, function (data) {
                deferred.reject(data);
            });

            return deferred.promise;
        };

        var moveFilesService = function (from_path, to_path, access_token) {
            var deferred = $q.defer();

            $http({
                method: 'POST',
                url: 'https://api.dropboxapi.com/2/files/move_v2',
                data: {
                    from_path: from_path,
                    to_path: to_path
                },
                headers: {
                    'Authorization': 'Bearer ' + access_token,
                    'Content-Type': 'application/json'
                }
            }).then(function () {
                deferred.resolve();
            }, function () {
                // Error
                deferred.reject();
            });
            return deferred.promise;
        };


        return {
            upload: uploadService,
            delete: deleteService,
            search: searchService,
            shareLink: shareLinkService,
            download: downloadService,
            rename: renameService,
            copy: copyService,
            createFolder: createFolderService,
            moveFiles: moveFilesService,
            auth: authService,
            patch: patchService
        };
    });


