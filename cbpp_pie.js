/*globals CBPP, Raphael*/
(function() {
	"use strict";
	if (typeof(CBPP.Pie)!=="undefined") {
		return;
	}
	CBPP.Pie = {};
	CBPP.Pie.ready = false;
	var urlBase;

    CBPP.Pie.load = function(callback) {
		CBPP.Pie.urlBase = CBPP.urlBase + "CBPP_Pie/v" + CBPP.Pie.version + "/";
		urlBase = CBPP.Pie.urlBase;
		var dependentScripts = [
			"listWithLinesLabels.js",
			"listWithLegend.js"
		];
		var thisPieLoaded = false, raphaelLoaded = false, outstandingScripts = 0;
		if (typeof(Raphael)==="undefined") {
			$.getScript(urlBase + "raphael.min.js", function() {
				raphaelLoaded = true;
				ready();
			});
		} else {
			raphaelLoaded = true;
		}
		var l = document.createElement("link");
        l.href = urlBase + "pie.css";
        l.type = "text/css";
        l.rel = "stylesheet";
        document.getElementsByTagName('head')[0].appendChild(l);

		var loadedScript = function() {
			outstandingScripts--;
			ready();
		};
		for (var i = 0, ii = dependentScripts.length; i<ii; i++) {
			outstandingScripts++;
			$.getScript(urlBase + dependentScripts[i], loadedScript);
		}
		function ready() {
			if (raphaelLoaded && outstandingScripts === 0) {
				thisPieLoaded = true;
				CBPP.Pie.ready = true;
				callback();
			}
		}
	};

	CBPP.Pie.DefaultColors = [
		"#0081a4",
		"#eb9123",
		"#003768",
		"#b9292f",
		"#0c61a4",
		"#f3fbff",
		"#f8c55b"
	];

    CBPP.Pie.Pie = function(selector, data, options) {
		var p = this;
		$(selector).addClass("cbpp_pie");
		this.paper = new Raphael($(selector)[0], $(selector).width(), $(selector).height());
		this.data = [];
		/*defaults*/
		this.options = {
			"stroke-width":0,
			fill:"#ddd",
			"margin-x":0.05,
			"margin-y":0.05,
			"center-offset" : [0,0],
			labelLocation : "internal",
			labelAreaWidth : 0.4,
			labelAreaMargin : 0.1,
			labelAreaPosition: "left",
			forceSquare: false,
			startAngle: 0,
			hoverEasing: (function() {
				function parabolaThreePoints(x1, y1, x2, y2, x3, y3) {
					return {
						a: (-(x2*y1) + x3*y1 + x1*y2 - x3*y2 - x1*y3 + x2*y3)/((-x1 + x2)*(x1 - x3)*(x2 - x3)),
						b: (x2*x2*y1 - x3*x3*y1 - x1*x1*y2 + x3*x3*y2 + x1*x1*y3 - x2*x2*y3)/((-x1 + x2)*(-x1 + x3)*(-x2 + x3)),
						c: (-(x2*x2*x3*y1) + x2*x3*x3*y1 + x1*x1*x3*y2 - x1*x3*x3*y2 - x1*x1*x2*y3 + x1*x2*x2*y3)/((-x1 + x2)*(-x1 + x3)*(-x2 + x3)) 
					};
				}
				var p = parabolaThreePoints(0,1,0.75,1.05,1,1.03);
				return function(t) {return (p.a)*t*t + (p.b*t) + p.c;};
			})(),
			outEasing: function(t) {
				return 0.03*(1-t)+1;
			},
			labelFormatter: function(dataIndex, data, total) {
				return data.name + "\n" + Math.round(data.value*1000000)/1000000 + "/" + Math.round(total*1000000)/1000000;
			}
		};
		this.sectorObjs = [];
		this.labelObjs = [];
		this.labelLines = [];
		this.sectorMeta = [];
		this.sectorAnimations = [];
		this.sectorsByRaphaelID = [];
		this.labelsByRaphaelID = [];
		this.highlighted = [];
		this.animations = [];
		$.extend(true, this.data, data);
		$.extend(true, this.options, options);
		this.options.startAngle = this.options.startAngle%360;
		var circleThreshold = function(i) {
			if (i.value/i.total > 0.999) {return true;}
			return false;
		};
		this.draw = function() {
			var pos = 0;
			var total = getTotal(this.data);
			this.width = $(selector).width();
			this.height = $(selector).height();
			p.baseRx = (1 - 2*p.options["margin-x"])*p.width/2*p.labelAdjust[p.options.labelLocation][0];
			p.baseRy = (1 - 2*p.options["margin-y"])*p.height/2*p.labelAdjust[p.options.labelLocation][1];
			if (p.options.forceSquare) {
				p.baseRx = p.baseRy = Math.min(p.baseRx, p.baseRy);
			}
			for (var i = 0, ii = this.data.length; i<ii; i++) {
				makeObj(i, this.data[i], total, pos);
				pos += this.data[i].value;
			}
			var locations = labelLocations[p.options.labelLocation]();
			for (i = 0, ii = this.data.length; i<ii; i++) {
				makeLabel(i, this.data[i], total, locations.labels[i]);
			}
			if (p.options.labelLocation === "listWithLines" && p.options.labelAlign === "reverse") {
				p.maxLabelWidth = findMaxLabelWidth();
				var textAlign, m, offset;
				if (p.options.labelAreaPosition==="left") {
					textAlign="end";
					m = 1;
					offset = 0;
				} else if (p.options.labelAreaPosition==="right") {
					textAlign = "start";
					m = -1;
					offset = p.width;
				} else {
					console.error("Invalid label alignment");
				}
				for (i = 0, ii = p.labelObjs.length; i<ii; i++) {
					var attr = {
						x: m*(p.maxLabelWidth) + offset,
						"text-anchor" : textAlign 
					};
					p.labelObjs[i].attr(attr);
				}
			}
			for (i = 0, ii = this.data.length; i<ii; i++) {
				drawLabelLines(i, this.data[i], total, locations.lines[i]);
			}
			function findMaxLabelWidth() {
				var width = 0;
				if (typeof(p.options.minLabelWidth)!=="undefined") {
					width = p.options.minLabelWidth;
				}
				for (var i = 0, ii = p.labelObjs.length; i<ii; i++) {
					width = Math.max(width, p.labelObjs[i].getBBox().width);
				}
				return width;
			}
		};
		this.animateTo = function(newDataAndOptions, duration, callback) {
			var newData = newDataAndOptions.data;
			var newOptions = newDataAndOptions.options;
			this.animating = true;
			function interpolate(p, obj1, obj2) {
                var i, ii, r;
                if (Object.prototype.toString.call(obj1) === "[object Array]" && Object.prototype.toString.call(obj2) === "[object Array]") {
                    //array loop
                    r = [];
                    for (i = 0,ii=obj1.length;i<ii;i++) {
                        r[i] = interpolate(p, obj1[i], obj2[i]);
                    }
                    return r;
                }
                if (typeof obj1 === "object" && typeof obj2 === "object" && obj1 !== null && obj2 !== null) {
                    //object loop
                    r = {};
                    for (i in obj1) {
                        if (obj1.hasOwnProperty(i)) {
                            if (obj2.hasOwnProperty(i)) {
                                r[i] = interpolate(p, obj1[i], obj2[i]);
                            } else {
                                r[i] = obj1[i];
                            }
                        }
                    }
                    return r;
                }
                if (isColor(obj1) && isColor(obj2)) {
                    return interpColor(p, obj1, obj2);  
                }
                if (isNaN(obj1*1) || isNaN(obj2*1)) {
                    return obj1; /*non numeric item*/
                } else {
                    return (1-p)*obj1 + p*obj2;
                }
            }
			var pr = 0;
			var FRAME_DURATION = 10;
			var num_frames = duration/FRAME_DURATION;
			var start_data = [];
			var start_options = {};
			$.extend(true, start_data, p.data);
			$.extend(true, start_options, p.options);
			var interval = setInterval(function() {
				pr += 1/num_frames;
				if (pr > 1) {
					pr = 1;
				}
				if (pr === 1) {
					clearInterval(interval);
					p.animating = false;
					if (typeof(callback)==="function") {
						callback();
					}
				}
				p.data = interpolate(pr, start_data, newData);
				p.options = interpolate(pr, start_options, newOptions);
				p.draw();
			}, FRAME_DURATION);
		};

		p.labelAdjust = {
			internal: [1,1],
			listWithLines: [1-p.options.labelAreaWidth-p.options.labelAreaMargin, 1]
		};
		p.center = {
			internal: function(w, h) {
				return [w/2, h/2];
			},
			listWithLines: function(w, h, law, lam) {
				if (p.options.labelAreaPosition === "left") {
					return [(law+lam)*w + (1-(law+lam))*w/2, h/2];
				} else if (p.options.labelAreaPosition === "right") {
					return [w-((law+lam)*w + (1-(law+lam))*w/2), h/2];
				}
			}
		};

		p.getSectorArcCenter = function(s, center) {
            function angle(v) {
                return 360*v/p.sectorMeta[s].total + p.options.startAngle; 
            }
            var theta0 = angle(p.sectorMeta[s].start)*Math.PI/180,
                theta1 = angle(p.sectorMeta[s].start + p.sectorMeta[s].value)*Math.PI/180,
                thetaMiddle = (theta0 + theta1)/2;
            return [center[0] + Math.cos(thetaMiddle)*p.baseRx, center[1] - Math.sin(thetaMiddle)*p.baseRy];
        };
		p.c2eCalc = function(theta, ratio) {
			theta = theta%(2*Math.PI);
			if (theta < 0) {theta += 2*Math.PI;}
			var adj = 0;
			if (theta > Math.PI/2 && theta < 3*Math.PI/2) {
				adj = Math.PI;
			}
			return Math.atan(ratio*Math.tan(theta))+adj;
		};
		p.c2e = function(theta, Rx, Ry) {
			return p.c2eCalc(theta, Ry/Rx);
		};
		p.e2c = function(theta, Rx, Ry) {
			return p.c2eCalc(theta, Rx/Ry);
		};

		function animateRadius(rEasing, dataIndex, callback) {
			var pr = 0;
			var s = p.sectorObjs[dataIndex];
			clearInterval(p.sectorAnimations[dataIndex]);
			var attrs = p.sectorMeta[dataIndex];
			var interval = p.sectorAnimations[dataIndex] = setInterval(function() {
				pr+=0.05;
				var lastFrame = false;
				if (pr >= 1) {
					pr = 1;
					clearInterval(interval);
					lastFrame = true;
				}
				var m = rEasing(pr);
				var rx = p.baseRx * m, ry = p.baseRy *m;
				var _attrs = {};
				$.extend(true, _attrs, attrs);
				_attrs.rx = rx;
				_attrs.ry = ry;
				p.sectorMeta[dataIndex].customRx = rx;
				p.sectorMeta[dataIndex].customRy = ry;
				if (p.animating===false || typeof(p.animating)==="undefined") {
					var path = getPath(_attrs);
					s.attr({path:path});
				}
				if (lastFrame) {
					p.sectorMeta[dataIndex].isAnimating = false;
					p.sectorMeta[dataIndex].customRx = undefined;
					p.sectorMeta[dataIndex].customRy = undefined;
					if (typeof(callback)==="function") {
						callback();
					}
				}
			}, 10);
		}

		function highlight(dI) {
			animateRadius(p.options.hoverEasing, dI);
		}

		function unhighlight(dI) {
			animateRadius(p.options.outEasing, dI);
		}

		var mouseover = function() {
			p.inSector = p.sectorsByRaphaelID[this.id];
			clearTimeout(p.changeTimer);
			p.changeTimer = setTimeout(sectorChange, 1);
		};
		var labelmouseover = function() {
			p.inSector = p.labelsByRaphaelID[this.id];
			clearTimeout(p.changeTimer);
			p.changeTimer = setTimeout(sectorChange, 1);
		};
		var mouseout = function() {
			p.outSector = p.sectorsByRaphaelID[this.id];
			clearTimeout(p.changeTimer);
			p.changeTimer = setTimeout(sectorChange, 1);
		};

		function sectorChange() {
			if (p.inSector !== p.outSector) {
				if (typeof(p.outSector)!=="undefined") {
					unhighlight(p.outSector);
				}
				if (typeof(p.inSector)!=="undefined") {
					highlight(p.inSector);
				}
			}
			p.inSector = undefined;
			p.outSector = undefined;
			clearTimeout(p.changeTimer);
		}

		var labelmouseout = function() {
			p.outSector = p.labelsByRaphaelID[this.id];
			clearTimeout(p.changeTimer);
			p.changeTimer = setTimeout(sectorChange, 1);
		};

		this.setData = function(d) {
			$.extend(true, this.data, d);
		};
		function isColor(str) {
			var len = str.length;
			if (typeof(str) !== "string") {
				return false;
			}
			if (len !== 4 && len !== 7) {
				return false;
			}
			if (str.charAt(0) !== "#") {
				return false;
			}
			for (var i = 1; i<len; i++) {
				if ("abcdef".indexOf(str[i]) === -1 && isNaN(str[i]*1)) {
					return false;
				}
			}
			return true;
		}
		function hexToRGB (hexString) {
			if (typeof(hexString)==="undefined") {
				return [255,255,255];
			}
			function fix(h) {
				var r = "#";
				for (var i = 1; i<=3; i++) {
					r += h.charAt(i) + h.charAt(i);
				}
				return r;
			}
			if (hexString.length === 4) {
				hexString = fix(hexString);
			}
			var r = parseInt(hexString.substr(1, 2), 16),
				g = parseInt(hexString.substr(3, 2), 16),
				b = parseInt(hexString.substr(5, 2), 16);
			return [r, g, b];
		}

		//And back the other way
		function RGBToHex (rgbArray) {
			function pad(num, size) {
				var s = "0" + num;
				return s.substr(s.length - size);
			}
			return "#" + pad(rgbArray[0].toString(16), 2) + pad(rgbArray[1].toString(16), 2) + pad(rgbArray[2].toString(16), 2);
		}
		function interpColor(p, c1, c2) {
			var c1Arr = hexToRGB(c1);
			var c2Arr = hexToRGB(c2);
			var c3Arr = [];
			for (var i = 0;i<3;i++) {
				c3Arr[i] = Math.round((1-p)*c1Arr[i] + p*c2Arr[i]);
			}
			return RGBToHex(c3Arr);
		}
		var labelLocations = {
			internal: function() {
				var r = [];
				var center = p.center[p.options.labelLocation](p.width, p.height, p.options.labelAreaWidth,p.options.labelAreaMargin);
				for (var i = 0, ii = p.data.length; i<ii; i++) {
					var arcCenter = p.getSectorArcCenter(i,  center);
					r[i] = [(arcCenter[0] + center[0])/2, (arcCenter[1] + center[1])/2];
				}
				return {
					labels: r,
					lines: []
				};
			},
			listWithLines: function() {
				return CBPP.Pie.ListWithLinesLabel(p,selector);
			}
		};
		function makeLabel(i, d, t, center) {
			var font = {
				"font-size":$(selector).css("font-size"),
				"font-family":$(selector).css("font-family"),
				"text-anchor": p.options.labelLocation === "internal" ? "center" : (p.options.labelAreaPosition === "left" ? "start" : "end")	
			};
			var text;
			if (typeof(d.customLabel)!=="undefined") {
				text = d.customLabel;
			} else {
				text = p.options.labelFormatter(i, d, t);
			}
			if (typeof(p.labelObjs[i])==="undefined") {
				p.labelObjs[i] = p.paper.text(center[0], center[1], text).attr(font);
				p.labelObjs[i].mouseover(labelmouseover);
				p.labelObjs[i].mouseout(labelmouseout);
			} else {
				p.labelObjs[i].attr({
					x: center[0],
					y: center[1],
					text: text
				});
				p.labelObjs[i].attr(font);
			}
			p.labelsByRaphaelID[p.labelObjs[i].id] = i;
		}
		function findLabelWidth(i) {
			return $(p.labelObjs[i].node).width()*1.1;
		}
		function drawLabelLines(i, d, t, line) {
			
			var labelWidth = findLabelWidth(i);
			function c(n) {
				if (n==="labelWidth") {
					if (p.options.labelAlign === "reverse") {
						return Math.round((p.options.labelAreaPosition === "left" ? (p.maxLabelWidth+5) : $(selector).width() - (p.maxLabelWidth+5)));
					}
					return Math.round((p.options.labelAreaPosition === "left" ? labelWidth : $(selector).width() - labelWidth));
				} else {
					return Math.round(n);
				}
			}
			if (typeof(line)!=="undefined") {
				
				var pathString = "M" + c(line[0][0]) + "," + c(line[0][1]);
				for (var j = 1, jj = line.length; j<jj; j++) {
					pathString += "L" + c(line[j][0]) + "," + c(line[j][1]);
				}
				if (typeof(p.labelLines[i])==="undefined") {
					p.labelLines[i] = p.paper.path(pathString);
				} else {
					p.labelLines[i].attr({path:pathString});
				}
			} else {
				if (typeof(p.labelLines[i])!=="undefined") {
					p.labelLines[i].remove();
					delete(p.labelLines[i]);
				}
			}
		}
		function makeObj(i, d, t, s) {
			var rx = p.baseRx,
				ry = p.baseRy;
			if (typeof(p.sectorMeta[i])!=="undefined") {
				if (typeof(p.sectorMeta[i].customRx)!=="undefined") {
					rx = p.sectorMeta[i].customRx;
				}
				if (typeof(p.sectorMeta[i].customRy)!=="undefined") {
					ry = p.sectorMeta[i].customRy;
				}
			}
			if (typeof(d.options)==="undefined") {d.options = {};}
			if (typeof(d.options.fill)==="undefined") {
				d.options.fill = CBPP.Pie.DefaultColors[i%CBPP.Pie.DefaultColors.length];
			}
			var cCoords = p.center[p.options.labelLocation](p.width, p.height, p.options.labelAreaWidth,p.options.labelAreaMargin);
			var attrs = {
				rx: rx,
				ry: ry,
				xloc: cCoords[0],
				yloc: cCoords[1],
				value: d.value,
				start: s,
				total: t
			};
			if (typeof(p.sectorMeta[i])==="undefined") {
				p.sectorMeta[i] = {};
			}
			$.extend(true, p.sectorMeta[i], attrs);
			if (typeof(p.sectorObjs[i])==="undefined") {
				p.sectorObjs[i] = sector(attrs, d.options);
				p.sectorObjs[i].mouseover(mouseover);
				p.sectorObjs[i].mouseout(mouseout);
			} else {
				/*object exists already*/
				var oldType = p.sectorObjs[i].type;
				var newType = circleThreshold(attrs) ? "ellipse" : "path";
				if (oldType !== newType) {
					p.sectorObjs[i].remove();
					p.sectorObjs[i] = sector(attrs, d.options);
					p.sectorObjs[i].mouseover(mouseover);
					p.sectorObjs[i].mouseout(mouseout);
				} else {
					sector(attrs, d.options, p.sectorObjs[i]);
				}
			}
			p.sectorsByRaphaelID[p.sectorObjs[i].id] = i;
		}
		function getTotal(data) {
			var t = 0;
			for (var i = 0, ii = data.length; i<ii; i++) {
				t += data[i].value;
			}
			return t;
		}
		function sector(i, d, existingObject) {
			//console.log(i);
			var attr = {
				"stroke" : "#000",
				"stroke-width" : 2,
				"fill":"#aaa"
			};
			var props = ["stroke", "stroke-width","fill"];
			var pL = props.length;
			
			for (var j = 0; j<pL;j++) {
				if (typeof(p.options[props[j]])==="undefined") {
					attr[props[j]] = p.options[props[j]];
				}
				if (typeof(d[props[j]])!=="undefined") {
					attr[props[j]] = d[props[j]];
				}
			}
			if (circleThreshold(i)) {
				var c = {
					x: i.xloc,
					y: i.yloc,
					rx: i.rx,
					ry: i.ry
				};
				if (typeof(existingObject)!=="undefined") {
					existingObject.attr(c);
					existingObject.attr(attr);
					return existingObject;
				} else {
					return p.paper.ellipse(c.x, c.y, c.rx, c.ry).attr(attr);
				}
			} else {
				var path = getPath(i);
				if (typeof(existingObject)!=="undefined") {
					existingObject.attr({
						path: path
					});
					existingObject.attr(attr);
					return existingObject;
				} else {
					return p.paper.path(path).attr(attr);
				}
			}
		}
		function getPath(i) {
			var total = i.total,
				alpha = 360/total * (i.value + i.start),
				startAlpha = 360/total*i.start,
				s = (startAlpha+90+p.options.startAngle) * Math.PI/180,
				a = (180 - alpha-90-p.options.startAngle) * Math.PI/180,
				x = i.xloc + i.rx * Math.sin(a),
				y = i.yloc - i.ry * Math.cos(a),
				path;
			path = [
				["M", i.xloc, i.yloc],
				["l", i.rx*Math.sin(s), i.ry*Math.cos(s)],
				["A", i.rx, i.ry, 0, +(alpha - startAlpha > 180), 0, x, y],
				["L", i.xloc, i.yloc]
			];
			return path;
		}
		this.draw();
		var resizeFunction = function() {
			$(selector + " svg").attr("width", $(selector).width());
			p.draw();
		};
		$(window).on("resize", resizeFunction);
    };
	
})();