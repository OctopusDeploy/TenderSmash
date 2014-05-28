var superagent = require("superagent");
var express = require('express');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var logentries = require('node-logentries');

var log = logentries.logger({
  token:'30e5530b-bbe3-48b7-a541-3096dbd53c0c'
});

var port = process.env.PORT || 3000;
var pub = process.env.OCTO_PUBLIC || 'public';
log.info("Starting on port", port);
log.info("Public directory is", pub);

var app = express();
app.use(bodyParser());
app.use(cookieParser());
app.use(express.static(__dirname + '/' + pub));

var proxyTenderRequest = function(method, expressRequest) {
  var url = expressRequest.params[0];
  url = url.replace("/proxy/", "/");
  if (url.indexOf("/") !== 0) {
    url = "/" + url;
  }

  if (url.indexOf("/pending") > 0) {
    log.info("Proxy request to Tender URL: ", url);
  }

  return superagent[method]("https://api.tenderapp.com" + url)
    .set("X-Tender-Auth", expressRequest.get("X-Tender-Auth"))
    .accept("application/vnd.tender-v1+json")
    .type("application/vnd.tender-v1+json")
    .buffer(true);
};

app.route("/proxy/*")
	.get(function(req, res) {
    proxyTenderRequest("get", req)
			.end(function(tres) {
				if (tres.ok) {
					var data = JSON.parse(tres.text);
					res.json(data);					
				} else {
					res.send(tres.status, { error: tres.text });
				}
			});		
	})
	.post(function(req, res, next) {
    var body = "";
    if (req.body) {
      body = JSON.stringify(req.body);
    }

    proxyTenderRequest("post", req)
      .send(body)
      .set("Content-Length", body.length)
			.end(function(tres) {
				if (tres.ok) {
					var data = JSON.parse(tres.text);
					res.json(data);					
				} else {
					res.send(tres.status, { error: tres.text });
				}
			});				
	});

app.get('*', function(req, res) {
	res.sendfile('./public/app.html');
});


app.listen(port);
