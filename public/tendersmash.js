var app = angular.module('tenderSmash', ['chieffancypants.loadingBar', 'LocalStorageModule'])
  .config(['cfpLoadingBarProvider', function(cfpLoadingBarProvider) {
    cfpLoadingBarProvider.includeSpinner = false;
  }]);


$.fn.selectRange = function(start, end) {
  var e = document.getElementById($(this).attr('id'));
  if (!e) return;
  else if (e.setSelectionRange) { e.focus(); e.setSelectionRange(start, end); } /* WebKit */
  else if (e.createTextRange) { var range = e.createTextRange(); range.collapse(true); range.moveEnd('character', end); range.moveStart('character', start); range.select(); } /* IE */
  else if (e.selectionStart) { e.selectionStart = start; e.selectionEnd = end; }
};

app.filter('moment', function() {
  return function(item) {
    return moment(item).fromNow();
  };
});

app.filter('reverse', function() {
  return function(items) {
    return (items || []).slice().reverse();
  };
});

app.factory("profileManager", function (localStorageService, $rootScope){
  var profileManager = {
    profile: {},
    hasProfile: false
  };

  profileManager.load = function() {
    profileManager.profile.name = localStorageService.get("name");
    profileManager.profile.tenderUri = localStorageService.get("uri");
    profileManager.profile.tenderKey = localStorageService.get("key");
    profileManager.hasProfile = profileManager.profile.name && profileManager.profile.tenderUri && profileManager.profile.tenderKey;
  };

  profileManager.save = function() {
    localStorageService.clearAll();
    localStorageService.set("name", profileManager.profile.name);
    localStorageService.set("uri", profileManager.profile.tenderUri);
    localStorageService.set("key", profileManager.profile.tenderKey);
  };

  $rootScope.profileManager = profileManager;
  $rootScope.profile = profileManager.profile;
  return profileManager;
});

app.factory("errorManager", function () {
  function ErrorManager() {
    var self = this;
    self.error = null;
    self.setError = function (e) {
      self.error = e;
      console.log("error: ", e);
    };
    self.clear = function() {
      self.error = null;
    }
  }

  return new ErrorManager();
});

app.factory('tenderRequestInterceptor', function($q, errorManager, profileManager) {
  return {
    'request': function(config) {
      config.url = config.url.replace("http://api.tenderapp.com", "/proxy")
        .replace("https://api.tenderapp.com:443", "/proxy")
        .replace("https://api.tenderapp.com", "/proxy");
      config.headers["X-Tender-Auth"] = profileManager.profile.tenderKey;
      return config;
    },

    'responseError': function(rejection) {
      errorManager.setError(rejection.status + " - " + rejection.statusText);
      return $q.reject(rejection);
    },

    'response': function(r) {
      errorManager.clear();
      return r;
    }
  };
});

app.config(function($httpProvider) {
  $httpProvider.interceptors.push('tenderRequestInterceptor');
});

app.controller("mainController", function ($scope, $http, $sce, $q, $timeout, profileManager, errorManager) {
	$scope.currentList = null;
	$scope.editProfile = false;
  $scope.errorManager = errorManager;
  $scope.lists = {};
  $scope.showSummary = false;
  $scope.smashStats = {
    total: 0,
    smashed: 0,
    smashedPercentage: 0,
    smash: function() {
      $scope.smashStats.smashed = $scope.smashStats.smashed + 1;
      $scope.smashStats.smashedPercentage = ($scope.smashStats.smashed / $scope.smashStats.total) * 100.00;
    }
  };

  $scope.toggleEditProfile = function() {
    $scope.editProfile = !$scope.editProfile;
  };

  $scope.toggleSummary = function() {
    $scope.showSummary = !$scope.showSummary;
  };

  $scope.getSummary = function() {
    var lines = [];
    _.each($scope.lists, function (l) {
      lines.push(l.name + ": " + l.discussions.length + " assigned");
      _.each(l.discussions, function (d) {
        lines.push(" - " + d.html_href + " " + d.title);
      });
    });

    return lines.join("\r\n");
  };

  $scope.saveAndReloadProfile = function() {
    profileManager.save();
    $scope.reload();
  };

  $scope.templates = {
    "HTH": "Hi [AUTHOR],\n\nREPLY\n\nHope that helps!\n\n[ME]",
    "QUICK": "Hi [AUTHOR],\n\nREPLY\n\n[ME]",
    "TFTR": "Hi [AUTHOR],\n\nThanks for the reply. REPLY\n\n[ME]",
    "TFGIT": "Hi [AUTHOR],\n\nThanks for getting in touch! REPLY\n\nHope that helps!\n\n[ME]"
  };

	$scope.selectList = function (d) {
		$scope.currentList = d;
		if ($scope.currentList.discussions.length) {
			$scope.currentDiscussion = $scope.currentList.discussions[0];
		} else {
			$scope.currentDiscussion = null;
		}
	};

  $scope.focusOnReply = function() {
    $timeout(function () {
      $("#reply_box").focus();
      var indexOfReply = $("#reply_box").val().indexOf("REPLY");
      console.log("index", indexOfReply);
      if (indexOfReply > 0) {
        $("#reply_box").selectRange(indexOfReply, indexOfReply + 5);
      } else {
        $("#reply_box").selectRange(0, 0);
      }

    }, 100);
  };

	$scope.selectDiscussion = function (d) {
    $("html, body").animate({ scrollTop: 0 }, "slow");
		$scope.currentDiscussion = d;
    $scope.focusOnReply();
  };

  $scope.changeTemplate = function(discussion, template) {
    $scope.applyTemplate(discussion, template);
    $scope.focusOnReply();
  };

  $scope.applyTemplate = function(discussion, template) {
    var author = "";
    var customerComments = _.filter(discussion.comments, function (c) { return !c.user_is_supporter && !c.system_message; });
    if (customerComments.length > 0) {
      author = customerComments[customerComments.length - 1].author_name;
    }

    var spaceIndex = author.indexOf(" ");
    if (spaceIndex > 0) {
      author = author.substring(0, spaceIndex);
    } else {
      spaceIndex = author.indexOf(".");
      if (spaceIndex > 0) {
        author = author.substring(0, spaceIndex);
      }
    }

    if (author.length > 1) {
      if (author[0] == author[0].toLowerCase()) {
        author = author[0].toUpperCase() + author.substring(1);
      }
    }

    if (!template) {
      if (discussion.comments.length === 1) {
        template = $scope.templates["TFGIT"];
      } else if (discussion.comments.length === 3) {
        template = $scope.templates["TFTR"];
      } else {
        template = $scope.templates["QUICK"];
      }
    }
    if (template) {
      discussion.reply = template.replace("[AUTHOR]", author).replace("[ME]", profileManager.profile.name);
    }
  };

  $scope.move = function(discussion) {
    var ix = $scope.currentList.discussions.indexOf(discussion);
    if(ix >= 0) {
      $scope.currentList.discussions.splice(ix, 1);
    }

    var reply = discussion.reply;
    $http.get(discussion.href)
      .success(function(data) {
        data.reply = reply;

        _.each(data.comments, function (c) { c.html = $sce.trustAsHtml(c.formatted_body); });

        if (data.cached_queue_list.length > 0) {
          data.queue_id = data.cached_queue_list[data.cached_queue_list.length - 1];
        } else {
          data.queue_id = "";
        }

        data.list_id = (data.queue_id ? data.queue_id : $scope.unassignedList.id);
        if(data.list_id == $scope.unassignedList.id) {
          $scope.unassignedList.discussions.push(data);
          $scope.unassignedList.discussions.sort($scope.sort);
        } else if(data.list_id == $scope.myList.id) {
          $scope.myList.discussions.push(data);
          $scope.myList.discussions.sort($scope.sort);
        } else {
          $scope.lists[data.list_id].discussions.push(data);
          $scope.lists[data.list_id].discussions.sort($scope.sort);
        }

        $scope.currentDiscussion = data;
      });
  };

  $scope.sort = function(first, second) {
    return first.last_updated_at < second.last_updated_at;
  }

  $scope.hide = function(discussion) {
    var discussionFound = false;

    var ix = $scope.myList.discussions.indexOf(discussion);
    if(ix >= 0) {
      $scope.myList.discussions.splice(ix, 1);
      discussionFound = true;
    } else {
      ix = $scope.unassignedList.discussions.indexOf(discussion);
      if(ix >= 0) {
        $scope.unassignedList.discussions.splice(ix, 1);
        discussionFound = true;
      }
    }

    if(!discussionFound) {
      _.each($scope.lists, function (list) {
        var ix = list.discussions.indexOf(discussion);
        if (ix >= 0) {
          list.discussions.splice(ix, 1);
          // no need to continue on looking for the discussion...
          return false; // because `return true` means go to the next iteration...
        }
      });
    }

    $scope.smashStats.smash();

    if ($scope.currentDiscussion == discussion) {
      $scope.currentDiscussion = null;
    }
  };

  $scope.ack = function(discussion) {
    $http.get(discussion.href)
      .success(function(data) {
        if (data.comments_count !== discussion.comments_count) {
          errorManager.setError("Someone else has commented on this item.");
        } else {
          $http.post(discussion.acknowledge_href)
            .success(function(x) {
              $scope.hide(discussion);
            });
        }
      });
  };

  $scope.reply = function(discussion) {
    $http.get(discussion.href)
      .success(function(data) {
        if (data.comments_count !== discussion.comments_count) {
          errorManager.setError("Someone else has commented on this item.");
        } else {
          $http.post(discussion.href + "/comments", { body: discussion.reply, skip_spam: true })
            .success(function(x) {
              $scope.hide(discussion);
            });
        }
      });
  };

  $scope.assign = function(discussion) {
    if (discussion.queue_id != "" && $scope.currentList.id === "00nil")
    {
      $http.post(discussion.href + "/queue?queue=" + discussion.queue_id, "")
        .success(function(x) {
          $scope.smashStats.smash();
          $scope.move(discussion);
        });
    }
    else if (discussion.queue_id != "") {
      $http.post(discussion.href + "/unqueue?queue=" + $scope.currentList.id, "")
        .success(function(unqueue) {
          $http.post(discussion.href + "/queue?queue=" + discussion.queue_id, "")
            .success(function(x) {
              $scope.smashStats.smash();
              $scope.move(discussion);
            });
        })
    }
    else {
      $http.post(discussion.href + "/unqueue?queue=" + $scope.currentList.id, "")
        .success(function(x) {
          $scope.smashStats.smash();
          $scope.move(discussion);
        });
    }
  };

  $scope.getComments = function(baseUrl, currentPage) {
    if (!currentPage) currentPage = 1;
    return $http.get(baseUrl + "?page=" + currentPage)
                .then(function(currentPageResponse) {
                  if (currentPageResponse.data.comments) {
                    return $scope.getComments(baseUrl, currentPage + 1)
                                .then(function(nextPageComments) {
                                  var comments = currentPageResponse.data.comments.concat(nextPageComments);
                                  return $q.when(comments);
                                });
                  } else {
                    return $q.when([]);
                  }
                });
  }

  $scope.reload = function() {
    $scope.currentDiscussion = null;
    $scope.currentList = null;
    $scope.lists = {};
    $scope.unassignedList = {};
    $scope.myList = {};
    $scope.profileId = null;
    $scope.isListsPopulated = false;

    profileManager.load();
    if (!profileManager.hasProfile) {
      $scope.editProfile = true;
      return;
    } else {
      $http.get('https://api.tenderapp.com/' + profileManager.profile.tenderUri + '/profile')
        .success(function(profile) {
          profileManager.profile.id = profile.href.substring(profile.href.lastIndexOf('/') + 1);
        });
    }

    $http.get('https://api.tenderapp.com/' + profileManager.profile.tenderUri + '/queues')
      .success(function (queues) {
        $http.get('https://api.tenderapp.com/' + profileManager.profile.tenderUri + '/discussions/pending')
          .success(function(pendingDiscussionListing) {
            console.log(pendingDiscussionListing);
            $scope.editProfile = false;
            $scope.queues = queues;

            $scope.unassignedList = {
              id: '00nil',
              discussions: [],
              name: 'Unassigned'
            };

            _.each(queues.named_queues, function (q) {
              q.id = q.href.substring(q.href.lastIndexOf('/') + 1);

              if(q.user_id == profileManager.profile.id) {
                $scope.myList = {
                  id: q.id,
                  discussions: [],
                  name: q.name
                };
              } else {
                $scope.lists[q.id] = {
                  id: q.id,
                  discussions: [],
                  name: q.name
                };
              }
            });

            $scope.isListsPopulated = true;

            var unassignedPromises = [];
            var promises = [];
            var pendingUnassigned = _.filter(pendingDiscussionListing.discussions, function (d) { return d.cached_queue_list.length === 0; });
            var pendingAssigned = _.filter(pendingDiscussionListing.discussions, function (d) { return d.cached_queue_list.length > 0; });
            
            _.each(pendingUnassigned, function (d) {
              unassignedPromises.push($http.get(d.href)
                                            .then(function(response) {
                                              var baseUrl = response.data.comments_href.replace("{?page}", "");
                                              return $scope.getComments(baseUrl)
                                                            .then(function(comments) {
                                                              response.data.comments = comments;
                                                              return $q.when(response);
                                                            });
                                            }));

            });
            
            _.each(pendingAssigned, function (discus) {
              promises.push($http.get(discus.href)
                                  .then(function(response) {
                                      var baseUrl = response.data.comments_href.replace("{?page}", "");
                                      return $scope.getComments(baseUrl)
                                                    .then(function(comments) {
                                                      response.data.comments = comments;
                                                      return $q.when(response);
                                                    });
                                  }));
                                  //.success(function (data) { return data; }));
            });

            console.debug('[' + (new Date()).toLocaleString() + '] Retrieving unassigned discussions...');
            $q.all(unassignedPromises).then(function (unassignedDiscussions) {
              console.debug('[' + (new Date()).toLocaleString() + '] Retrieved all unassigned discussions...');
              _.each(unassignedDiscussions, function (response) {
                var data = response.data;
                $scope.applyTemplate(data);

                _.each(data.comments, function (c) { c.html = $sce.trustAsHtml(c.formatted_body); });
                data.queue_id = "";
                $scope.unassignedList.discussions.push(data);
              });
              
              $scope.smashStats.smashed = 0;
              $scope.smashStats.smashedPercentage = 0;
              $scope.smashStats.total = unassignedDiscussions.length;

              $scope.selectList($scope.unassignedList);
              
              console.debug('[' + (new Date()).toLocaleString() + '] Retrieving assigned discussions...');
              $q.all(promises).then(function (discussions) {
                console.debug('[' + (new Date()).toLocaleString() + '] Retrieved all assigned discussions...');
                var firstList = null;
                _.each(discussions, function (response) {
                  var data = response.data;
                  $scope.applyTemplate(data);

                  _.each(data.comments, function (c) { c.html = $sce.trustAsHtml(c.formatted_body); });

                  if (data.cached_queue_list.length > 0) {
                    data.queue_id = data.cached_queue_list[data.cached_queue_list.length - 1];
                  } else {
                    data.queue_id = "";
                  }

                  data.list_id = (data.queue_id ? data.queue_id : $scope.unassignedList.id);
                  if(data.list_id == $scope.unassignedList.id) {
                    $scope.unassignedList.discussions.push(data);
                  } else if(data.list_id == $scope.myList.id) {
                    $scope.myList.discussions.push(data);
                  } else {
                    $scope.lists[data.list_id].discussions.push(data);
                  }
                });
                
                $scope.smashStats.total += $scope.myList.discussions.length;

              });

            });

          });
      });
  };

  $scope.reload();
});
