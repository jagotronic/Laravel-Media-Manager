export default {
    methods: {
        /*                Upload                */
        fileUpload() {
            const manager = this
            let uploadTypes = this.restrict.uploadTypes ? this.restrict.uploadTypes.join(',') : null
            let uploadsize = this.restrict.uploadsize ? this.restrict.uploadsize : 256

            let last = null
            let sending = false

            new Dropzone('#new-upload', {
                createImageThumbnails: false,
                parallelUploads: 10,
                hiddenInputContainer: '#new-upload',
                uploadMultiple: true,
                forceFallback: false,
                ignoreHiddenFiles: true,
                acceptedFiles: uploadTypes,
                maxFilesize: uploadsize,
                timeout: 3600000, // 60 mins
                previewsContainer: '#uploadPreview',
                processingmultiple() {
                    manager.showProgress = true
                },
                sending() {
                    sending = true
                },
                totaluploadprogress(uploadProgress) {
                    manager.progressCounter = `${uploadProgress}%`
                },
                successmultiple(files, res) {
                    res.map((item) => {
                        if (item.success) {
                            manager.showNotif(`${manager.trans('upload_success')} "${item.message}"`)
                            last = item.message
                        } else {
                            manager.showNotif(item.message, 'danger')
                        }
                    })

                    sending = false
                },
                errormultiple(file, res) {
                    file = Array.isArray(file) ? file[0] : file
                    manager.showNotif(`"${file.name}" ${res}`, 'danger')
                },
                queuecomplete() {
                    if (!sending) {
                        manager.$refs['success-audio'].play()
                        manager.progressCounter = 0
                        manager.showProgress = false

                        manager.removeCachedResponse().then(() => {
                            last
                                ? manager.getFiles(manager.folders, null, last)
                                : manager.getFiles(manager.folders)
                        })
                    }
                }
            })
        },

        // upload image from link
        saveLinkForm(event) {
            let url = this.urlToUpload

            if (!url) {
                return this.showNotif(this.trans('no_val'), 'warning')
            }

            this.toggleUploadArea = false
            this.toggleLoading()
            this.loadingFiles('show')

            axios.post(event.target.action, {
                path: this.files.path,
                url: url,
                random_names: this.randomNames
            }).then(({data}) => {
                this.toggleLoading()
                this.loadingFiles('hide')

                if (!data.success) {
                    return this.showNotif(data.message, 'danger')
                }

                this.resetInput('urlToUpload')
                this.$nextTick(() => {
                    this.$refs.save_link_modal_input.focus()
                })

                this.showNotif(`${this.trans('save_success')} "${data.message}"`)
                this.removeCachedResponse().then(() => {
                    this.getFiles(this.folders, null, data.message)
                })

            }).catch((err) => {
                console.error(err)
                this.toggleLoading()
                this.toggleModal()
                this.loadingFiles('hide')
                this.resetInput('urlToUpload')

                this.ajaxError()
            })
        },

        /*                Main                */
        getFiles(folders = '/', prev_folder = null, prev_file = null) {
            this.resetInput(['sortBy', 'currentFilterName', 'selectedFile', 'currentFileIndex'])
            this.noFiles('hide')

            if (!this.loading_files) {
                this.toggleInfo = false
                this.toggleLoading()
                this.loadingFiles('show')
            }

            if (folders != '/') {
                folders = this.clearDblSlash(`/${folders.join('/')}`)
            }

            // clear expired cache
            return this.invalidateCache().then(() => {
                // get data
                return this.getCachedResponse()
                    .then((res) => {
                        // return cache
                        if (res) {
                            this.files = res.files
                            return this.filesListCheck(prev_folder, prev_file, folders, res.dirs)
                        }

                        // or make new call
                        return axios.post(this.routes.files, {
                            folder: folders,
                            dirs: this.folders
                        }).then(({data}) => {

                            // folder doesnt exist
                            if (data.error) {
                                return this.showNotif(data.error, 'danger')
                            }

                            // normal
                            this.files = data.files
                            this.lockedList = data.locked
                            this.filesListCheck(prev_folder, prev_file, folders, data.dirs)

                            // cache response
                            this.cacheResponse({
                                files: data.files,
                                dirs: data.dirs
                            })

                        }).catch((err) => {
                            console.error(err)
                            this.ajaxError()
                        })
                    })
            })
        },
        updateDirsList() {
            axios.post(this.routes.dirs, {
                folder_location: this.folders
            }).then(({data}) => {
                this.dirsListCheck(data)
            }).catch((err) => {
                console.error(err)
                this.ajaxError()
            })
        },

        filesListCheck(prev_folder, prev_file, folders, dirs) {
            // check for hidden extensions
            if (this.hideExt.length) {
                this.files.items = this.files.items.filter((e) => {
                    return !this.checkForHiddenExt(e)
                })
            }

            // check for hidden folders
            if (this.hidePath.length) {
                this.files.items = this.files.items.filter((e) => {
                    return !this.checkForHiddenPath(e)
                })
            }

            // hide folders for restrictionMode
            if (this.restrictModeIsOn()) {
                this.files.items = this.files.items.filter((e) => {
                    return e.type != 'folder'
                })
            }

            // we have files
            if (this.allItemsCount) {
                this.loadingFiles('hide')
                this.toggleLoading()
                this.toggleInfo = true

                // check for prev opened folder
                if (prev_folder) {
                    this.files.items.some((e, i) => {
                        if (e.name == prev_folder) {
                            return this.currentFileIndex = i
                        }
                    })
                }

                // lazy loading is not active
                if (!this.config.lazyLoad) {
                    // check for prev selected file
                    if (prev_file) {
                        this.files.items.some((e, i) => {
                            if (e.name == prev_file) {
                                return this.currentFileIndex = i
                            }
                        })
                    }

                    // if no prevs found
                    if (!this.currentFileIndex) {
                        this.selectFirst()
                    }
                } else {
                    // lazy loading is active & first file is a folder
                    if (this.fileTypeIs(this.allFiles[0], 'folder')) {
                        this.selectFirst()
                    }
                }

                // scroll & click on prev selected item
                this.$nextTick(() => {
                    let curIndex = this.currentFileIndex
                    if (curIndex) {
                        this.scrollToFile(this.getElementByIndex(curIndex))
                    }
                })

                // scroll to breadcrumb item
                if (this.$refs.bc) {
                    let name = folders.split('/').pop()
                    let count = document.getElementById(`${name ? name : 'library'}-bc`).offsetLeft
                    this.$refs.bc.$el.scrollBy({top: 0, left: count, behavior: 'smooth'})
                }

                if (this.searchFor) {this.updateSearchCount()}
                return this.dirsListCheck(dirs)
            }

            // we dont have files
            this.toggleLoading()
            this.loadingFiles('hide')
        },
        dirsListCheck(data) {
            const baseUrl = this.config.baseUrl
            this.directories = data

            // check for hidden folders in directories
            if (this.hidePath.length) {
                this.directories = this.directories.filter((e) => {
                    return !this.checkForFolderName(e)
                })
            }

            if (this.lockedList.length) {
                // nested folders
                if (this.files.path !== '') {
                    return this.directories = this.directories.filter((e) => {
                        return !this.IsLocked(this.clearDblSlash(`${baseUrl}/${this.folders.join('/')}/${e}`))
                    })
                }

                // root
                this.directories = this.directories.filter((e) => {
                    return !this.IsLocked(this.clearDblSlash(`${baseUrl}/${e}`))
                })
            }
        },

        /*                Tool-Bar                */
        NewFolderForm(event) {
            let folder_name = this.newFolderName
            let path = this.files.path

            if (!folder_name) {
                return this.showNotif(this.trans('no_val'), 'warning')
            }

            if (folder_name.match(/^.\/.*|^.$/)) {
                return this.showNotif(this.trans('single_char_folder'), 'danger')
            }

            this.toggleLoading()

            axios.post(event.target.action, {
                path: path,
                new_folder_name: folder_name
            }).then(({data}) => {
                this.toggleLoading()
                this.toggleModal()
                this.resetInput('newFolderName')

                if (!data.success) {
                    return this.showNotif(data.message, 'danger')
                }

                this.showNotif(`${this.trans('create_success')} "${data.new_folder_name}" at "${path || '/'}"`)
                this.isBulkSelecting()
                    ? this.blkSlct()
                    : false

                this.deleteCachedResponse(this.cacheName).then(() => {
                    this.getFiles(this.folders, data.new_folder_name)
                })

            }).catch((err) => {
                console.error(err)
                this.ajaxError()
            })
        },

        // rename
        RenameFileForm(event) {
            let changed = this.newFilename
            let filename = this.selectedFile.name
            let cacheName = this.getCacheName(filename)
            let ext = this.getExtension(filename)
            let newFilename = ext == null ? changed : `${changed}.${ext}`

            if (!changed) {
                return this.showNotif(this.trans('no_val'), 'warning')
            }

            if (this.selectedFileIs('folder')) {
                if (changed.match(/^.\/.*|^.$/)) {
                    return this.showNotif(this.trans('single_char_folder'), 'danger')
                }

                if (this.hasLockedItems(filename, cacheName)) {
                    this.showNotif(`"${filename}" ${this.trans('error_altered_fwli')}`, 'danger')
                    return this.toggleModal()
                }
            }

            this.toggleLoading()

            axios.post(event.target.action, {
                path: this.files.path,
                filename: filename,
                new_filename: newFilename
            }).then(({data}) => {
                this.toggleLoading()
                this.toggleModal()

                if (!data.success) {
                    return this.showNotif(data.message, 'danger')
                }

                // clear image cache
                if (this.selectedFileIs('image')) {
                    this.removeImageCache(this.selectedFile.path)
                }

                this.showNotif(`${this.trans('rename_success')} "${filename}" to "${data.new_filename}"`)
                this.updateItemName(this.selectedFile, filename, data.new_filename)

                // clear folders cache
                if (this.selectedFileIs('folder')) {
                    this.updateDirsList()
                    this.removeCachedResponse(null, [cacheName])
                } else {
                    this.removeCachedResponse()
                }

            }).catch((err) => {
                console.error(err)
                this.ajaxError()
            })
        },

        // move
        MoveFileForm(event) {
            if (this.checkForFolders) {
                let destination = this.moveToPath
                let copy = this.useCopy
                let hasErrors = false
                let files = this.checkNestedLockedItems(
                    this.bulkItemsCount
                        ? this.bulkItemsFilter
                        : [this.selectedFile]
                )

                if (!files.length) {
                    return this.toggleModal()
                }

                this.toggleLoading()

                axios.post(event.target.action, {
                    path: this.files.path,
                    destination: destination,
                    moved_files: files,
                    use_copy: copy
                }).then(({data}) => {
                    this.toggleLoading()
                    this.toggleModal()

                    data.map((item) => {
                        if (!item.success) {
                            hasErrors = true
                            return this.showNotif(item.message, 'danger')
                        }

                        // copy
                        if (copy) {
                            this.showNotif(`${this.trans('copy_success')} "${item.name}" to "${destination}"`)
                        }

                        // move
                        else {
                            this.showNotif(`${this.trans('move_success')} "${item.name}" to "${destination}"`)
                            this.removeFromLists(item.name, item.type)

                            // update dirs list after move
                            this.updateDirsList()

                            // update search count
                            if (this.searchFor) {
                                this.searchItemsCount = this.filesList.length
                            }
                        }

                        // update folder count when folder is moved/copied into another
                        this.fileTypeIs(item, 'folder')
                            ? this.updateFolderCount(destination, item.items, item.size)
                            : this.updateFolderCount(destination, 1, item.size)
                    })

                    this.clearImageCache()
                    this.$refs['success-audio'].play()
                    this.removeCachedResponse(destination == '../' ? null : destination).then(() => {
                        if (this.allItemsCount) {
                            this.isBulkSelecting()
                                ? this.blkSlct()
                                : hasErrors
                                    ? false
                                    : !this.config.lazyLoad
                                        ? this.selectFirst()
                                        : this.lazySelectFirst()
                        }
                    })

                }).catch((err) => {
                    console.error(err)
                    this.ajaxError()
                })
            }
        },

        // delete
        DeleteFileForm(event) {
            let clearCache = false
            let cacheNamesList = []
            let files = this.checkNestedLockedItems(
                this.bulkItemsCount
                    ? this.bulkItemsFilter
                    : [this.selectedFile]
            )

            if (!files.length) {
                return this.toggleModal()
            }

            this.toggleLoading()

            axios.post(event.target.action, {
                path: this.files.path,
                deleted_files: files
            }).then(({data}) => {
                this.toggleLoading()
                this.toggleModal()

                data.map((item) => {
                    if (!item.success) {
                        return this.showNotif(item.message, 'danger')
                    }

                    // clear indexdb cache
                    if (item.type == 'folder') {
                        cacheNamesList.push(this.getCacheName(item.name))
                    }
                    // clear cache storage cache
                    if (item.type != 'folder') {
                        this.removeImageCache(this.clearDblSlash(item.path))
                    }

                    clearCache = true
                    this.showNotif(`${this.trans('delete_success')} "${item.name}"`)
                    this.removeFromLists(item.name, item.type)
                })

                if (clearCache) {
                    this.$refs['success-audio'].play()
                    this.removeCachedResponse(null, cacheNamesList).then(() => {
                        this.isBulkSelecting()
                            ? this.blkSlct()
                            : this.allItemsCount
                                ? !this.config.lazyLoad
                                    ? this.selectFirst()
                                    : this.lazySelectFirst()
                                : false
                    })
                }

                this.$nextTick(() => {
                    if (this.searchFor) {
                        this.searchItemsCount = this.filesList.length
                    }
                })

            }).catch((err) => {
                console.error(err)
                this.ajaxError()
            })
        },

        /*                Ops                */
        removeFromLists(name, type) {
            if (this.filteredItemsCount) {
                let list = this.filterdList

                list.map((e) => {
                    if (e.name.includes(name) && e.type.includes(type)) {
                        list.splice(list.indexOf(e), 1)
                    }
                })
            }

            if (type == 'folder' && this.directories.length) {
                let list = this.directories

                list.map((e) => {
                    if (e.includes(name)) {
                        list.splice(list.indexOf(e), 1)
                    }
                })
            }

            let list = this.files.items

            this.files.items.map((e) => {
                if (e.name == name && e.type == type) {
                    list.splice(list.indexOf(e), 1)
                }
            })

            this.resetInput(['selectedFile', 'currentFileIndex'])
        },
        updateFolderCount(destination, count, weight = 0) {
            if (destination !== '../') {

                if (destination.includes('/')) {
                    // get the first dir in the path
                    // because this is what the user is currently viewing
                    destination = destination.split('/')
                    destination = destination[0] == '' ? destination[1] : destination[0]
                }

                if (this.filteredItemsCount) {
                    this.filterdList.some((e) => {
                        if (e.type == 'folder' && e.name == destination) {
                            e.items += parseInt(count)
                            e.size += parseInt(weight)
                        }
                    })
                }

                this.files.items.some((e) => {
                    if (e.type == 'folder' && e.name == destination) {
                        e.items += parseInt(count)
                        e.size += parseInt(weight)
                    }
                })
            }
        },
        updateItemName(item, oldName, newName) {
            // update the main files list
            let filesIndex = this.files.items[this.files.items.indexOf(item)]
            filesIndex.name = newName
            filesIndex.path = filesIndex.path.replace(oldName, newName)

            // if found in the filterd list, then update it aswell
            if (this.filterdList.includes(item)) {
                let filterIndex = this.filterdList[this.filterdList.indexOf(item)]
                filterIndex.name = newName
                filesIndex.path = filterIndex.path.replace(oldName, newName)
            }
        }
    }
}
