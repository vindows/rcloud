var editor = function () {
    function populate_interests(tree_model, config, this_user) {
        var user_nodes = [];
        for (var username in config.interests) {
            var notebooks_config = config.interests[username];
            var notebook_nodes = [];
            for(var name in notebooks_config) {
                var attrs = notebooks_config[name];
                var result = {
                    label: attrs.description,
                    gist_name: name,
                    last_commit: attrs.last_commit || '',
                    id: '/' + username + '/' + name
                };
                tree_model[result.id] = result;
                notebook_nodes.push(result);
            }

            if(username === this_user) {
                notebook_nodes.push({
                    label: "[New Notebook]",
                    id: "newbook"
                });
            };
            var node = {
                label: username,
                id: '/' + username,
                children: notebook_nodes
            };
            user_nodes.push(node);
        }
        var tree_data = [ { 
            label: '/',
            id: '/',
            children: user_nodes
        } ];
        var $tree = $("#editor-book-tree");
        $tree.tree("loadData", tree_data); 
        var folder = $tree.tree('getNodeById', "/" + rcloud.username());
        $(folder.element).parent().prepend(folder.element);
        $tree.tree('openNode', folder);
    }

    var result = {
        widget: undefined,
        config: undefined,
        book_tree_model: undefined,
        init: function() {
            var that = this;
            $("#input-text-source-results-title").css("display", "none");
            $("#input-text-history-results-title").css("display", "none");
            this.create_book_tree_widget();
            this.load_config(function(config) {
                if(config.currbook)
                    that.load_notebook(config.currbook);
                else
                    that.new_notebook();
            });
            var old_text = "";
            window.setInterval(function() {
                var new_text = $("#input-text-search").val();
                if (new_text !== old_text) {
                    old_text = new_text;
                    that.search(new_text);
                }
            }, 500);
        },
        create_book_tree_widget: function() { 
            var that = this;
            var $tree = $("#editor-book-tree");
            function onCreateLiHandler(node, $li) {
                node = that.book_tree_model[node.id];
                if (node) {
                    $li.find('.title').after('<span style="float: right">' + node.last_commit + '</span>');
                }
            }
            $tree.tree({
                autoOpen: 1,
                onCreateLi: onCreateLiHandler
            });
            $tree.bind(
                'tree.click', function(event) {
                    if (event.node.id === "newbook") 
                        that.new_notebook();
                    else
                        that.load_notebook(event.node.gist_name);
                }
            );
        },
        load_config: function(k) {
            var that = this;
            var this_user = rcloud.username();
            rcloud.load_user_config(this_user, function(config) {
                function defaults() {
                    var ret = {currbook: null,
                        nextwork: 1,
                        interests: {}};
                    ret.interests[this_user] = {};
                    return ret;
                }
                that.config = config || defaults();
                that.book_tree_model = {};
                populate_interests(that.book_tree_model, that.config, this_user);
                k && k(that.config);
            });
        },
        save_config: function() {
            var this_user = rcloud.username();
            rcloud.save_user_config(this_user, this.config);
        },
        new_notebook: function() {
            var desc = "work" + this.config.nextwork;
            ++this.config.nextwork;
            shell.new_notebook(desc, _.bind(result.notebook_loaded,this));
        },
        load_notebook: function(notebook) {
            var that = this;
            shell.load_notebook(notebook, _.bind(result.notebook_loaded,this));
        },
        notebook_loaded: function(result) {
            this.config.currbook = result.id;
            this.update_notebook_status(result.user.login, 
                                        result.id, 
                                        {description: result.description,
                                         last_commit: result.history[0].committed_at});
        },
        update_notebook_status: function(user, notebook, status) {
            var iu = this.config.interests[user], entry, upd;
            if(iu[notebook]) {
                entry = iu[notebook];
                upd = true;
            }
            else {
                entry = iu[notebook] = {};
                upd = false;
            }
            entry.description = status.description;
            entry.last_commit = status.last_commit;
            var data = {label: status.description,
                        last_commit: status.last_commit};

            var $tree = $("#editor-book-tree");
            if(upd) {
                var id = '/' + user + '/' + notebook;
                var node = $tree.tree('getNodeById', id);
                $tree.tree("updateNode", node, data); 
            }
            else {
                var newnode = $tree.tree('getNodeById', "newbook");
                data.gist_name = notebook;
                data.id = '/' + user + '/' + notebook;
                $tree.tree("addNodeBefore", data, newnode);
            }

            this.save_config();
        },
        search: function(search_string) {
            var that = this;
            function split_source_search_lines(line) {
                var r = /:/g;
                var r2 = /\/([^/]+)\/([^/]+)/;
                var result = [];
                while (r.exec(line) !== null) {
                    result.push(r.lastIndex);
                    if (result.length === 2) {
                        var path = line.substring(0, result[0]-1);
                        var t = path.match(r2);
                        return [t[1], t[2],
                                line.substring(result[0], result[1]-1),
                                line.substring(result[1])];
                    }
                }
                throw "shouldn't get here";
            };
            function split_history_search_lines(line) {
                var t = line.indexOf(':');
                var r = /\|/g;
                var line_number = line.substring(0, t);
                line = line.substring(t+1);
                var result = [];
                while (r.exec(line) !== null) {
                    result.push(r.lastIndex);
                    if (result.length === 2) {
                        return [line_number, 
                                line.substring(0, result[0]-1),
                                line.substring(result[0], result[1]-1),
                                line.substring(result[1])];
                    }
                }
                throw "shouldn't get here";
            };

            function update_source_search(result) {
                d3.select("#input-text-source-results-title")
                    .style("display", (result !== null && result.length >= 1)?null:"none");
                var data = _.map(result, split_source_search_lines);
                d3.select("#input-text-source-results-table")
                    .selectAll("tr").remove();
                var td_classes = ["user", "filename", "linenumber", "loc"];
                d3.select("#input-text-source-results-table")
                    .selectAll("tr")
                    .data(data)
                    .enter().append("tr")
                    .selectAll("td")
                    .data(function(d,i) { 
                        return _.map(d, function(v, k) {
                            return [v, i];
                        });
                    })
                    .enter()
                    .append("td")
                    .text(function(d, i) { 
                        if (i === 2) { 
                            return d[0] + ":"; 
                        } else {
                            return d[0];
                        }
                    })
                    .attr("class", function(d, i) {
                        var j = d[1];
                        d = d[0];
                        if (j === 0 || data[j-1][i] !== d)
                            return "text-result-table-" + td_classes[i];
                        else
                            return "text-result-table-same-" + td_classes[i];
                    })
                    .on("click", function(d, i) {
                        if (i !== 1 && i !== 3)
                            return;
                        var j = d[1];
                        var user = data[j][0], notebook = data[j][1];
                        that.load_notebook(notebook);
                    })
                ;
            };
            function update_history_search(result) {
                d3.select("#input-text-history-results-title")
                    .style("display", (result !== null && result.length >= 1)?null:"none");
                var data = _.map(result, split_history_search_lines);
                d3.select("#input-text-history-results-table")
                    .selectAll("tr").remove();
                var td_classes = ["date", "user", "loc"];
                d3.select("#input-text-history-results-table")
                    .selectAll("tr")
                    .data(data)
                    .enter().append("tr")
                    .selectAll("td")
                    .data(function(d,i) { 
                        return _.map(d.slice(1), function(v, k) {
                            return [v, i];
                        });
                    })
                    .enter()
                    .append("td")
                    .text(function(d) { 
                        return d[0];
                    })
                    .attr("class", function(d, i) {
                        var j = d[1];
                        d = d[0];
                        if (j === 0 || data[j-1][i+1] !== d)
                            return "text-result-table-" + td_classes[i];
                        else
                            return "text-result-table-same-" + td_classes[i];
                    })
                    .on("click", function(d, i) {
                    })
                ;
            };
            rcloud.search(search_string, function(result) {
                update_source_search(result[0]);
                update_history_search(result[1]);
            });
        }
    };
    return result;
}();
