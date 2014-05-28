var app = angular.module('tenderSmash', ['chieffancypants.loadingBar', 'LocalStorageModule']);

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
      config.url = config.url.replace("http://api.tenderapp.com", "/proxy");
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

  $scope.toggleEditProfile = function() {
    $scope.editProfile = !$scope.editProfile;
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
    var customerComments = _.filter(discussion.comments, function (c) { return !c.user_is_supporter; });
    console.log(customerComments);
    var author = customerComments[customerComments.length - 1].author_name;

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

  $scope.hide = function(discussion) {
    _.each($scope.lists, function (list) {
      var ix = list.discussions.indexOf(discussion);
      if (ix >= 0) {
        list.discussions.splice(ix, 1);
      }
    });

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
          $http.post(discussion.href, { body: discussion.reply, skip_spam: true })
            .success(function(x) {
              $scope.hide(discussion);
            });
        }
      });
  };

  $scope.reload = function() {
    $scope.currentDiscussion = null;
    $scope.currentList = null;
    $scope.lists = {};

    profileManager.load();
    if (!profileManager.hasProfile) {
      $scope.editProfile = true;
      return;
    }

    $http.get('http://api.tenderapp.com/' + profileManager.profile.tenderUri + '/discussions/pending')
      .success(function(pendingDiscussionListing) {
        $scope.editProfile = false;

        $http.get('http://api.tenderapp.com/' + profileManager.profile.tenderUri + '/categories')
          .success(function (categoriesResponse) {

            _.each(categoriesResponse.categories, function (category) {
              $scope.lists[category.href] = {
                discussions: [],
                name: category.name
              };
            });

            var promises = [];
            _.each(pendingDiscussionListing.discussions, function (discus) {
              promises.push($http.get(discus.href).success(function (data) { return data; }));
            });

            $q.all(promises).then(function (discussions) {
              var firstList = null;
              _.each(discussions, function (response) {
                var data = response.data;
                $scope.applyTemplate(data);

                _.each(data.comments, function (c) { c.html = $sce.trustAsHtml(c.formatted_body); });

                $scope.lists[data.category_href].discussions.push(data);

                if (!firstList) {
                  firstList = $scope.lists[data.category_href];
                }
              });

              if (firstList) {
                $scope.selectList(firstList);
              }
            });
          });
      });
  };

  $scope.reload();
});
