(function () {
    var utils = {
        addClass: function (target, className) {
            class_arr = target.getAttribute('class') ? target.getAttribute('class').split(' ') : [];
            class_arr.push(className);
            target.setAttribute('class', class_arr.join(' '));
            return target;
        },
        hasClass: function (target, className) {
            class_arr = target.getAttribute('class') ? target.getAttribute('class').split(' ') : [];
            return class_arr.indexOf(className) > -1;
        },
        attr: function (target, prop, value) {
            if (value) {
                target.setAttribute(prop, value);
                return target;
            } else {
                return target.getAttribute(prop);
            }
        },
        css: function (target, cssObj) {
            for (var prop in cssObj) {
                target.style[prop] = cssObj[prop];
            }
            return target;
        },
        show: function (target) {
            this.attr(target, 'isShow', 'on');
            clearInterval(target.timer);
            this.css(target, {
                display: 'block',
                opacity: 1
            });
        },
        hide: function (target) {
            this.attr(target, 'isShow', 'off');
            this.css(target, {
                display: 'none'
            });
        },
        formatDate: function (num) {
            return num < 10 ? '0' + num : num;
        },
        fadeOut: function(target) {
            if (this.attr(target, 'isShow') == 'off') return;
            this.attr(target, 'isShow', 'off');
            var opacity = 100;
            var _this = this;
            target.timer = setInterval(function() {
                opacity -= opacity / 20;
                opacity < 80 && _this.css(target, {
                    opacity: opacity / 100
                })
                if (opacity <= 5) {
                    clearInterval(target.timer);
                    _this.css(target, {
                        display: 'none',
                        opacity: 1
                    })
                }
            },10);
        },
    };

    function TimePicker(elem) {
        // 参数
        this.bindElem = elem; // 绑定的元素
        this.elem_wrap = null; // calendar-wrap
        this.timer = null; // 本插件异步全都用macroTask中的setTimeout来处理
        this.isSelected = false; // 是否触发了选择时间动作
        var date = new Date();
        this.timeOpt = {
			_hour: date.getHours(), 		//Time-----------
			_minute: date.getMinutes(), 	//Time-----------
			selectHour: date.getHours(),		//Time-----------
            selectMinute: date.getMinutes(),	//Time-----------
        }

        this.elem_container = document.querySelector('body');
        this.init();

    };
    TimePicker.create = function(opt) {
        for(var prop in opt){
            TimePicker.Opt[prop] = opt[prop];
        };
        var elemArr = document.getElementsByClassName(TimePicker.Opt.classN);

        for(var i=0;i<elemArr.length;i++){
            elemArr[i].calendar = new TimePicker(elemArr[i]);
        }
    }
    TimePicker.originOpt = {
        PICKERNAME: 'calendar-btn',
        PANELKEY: 'self-panel-key', // 存储picker对应的calendar的唯一key
        PANELSTR: 'calendar-panel_',
        PANELWRAPCLASS: 'calendar-wrap'
    }
    TimePicker.Opt = {
        classN: '',
        callBack: function(bindElem, selectTime) {}
    };
    TimePicker.version = '1.0.0';

    TimePicker.prototype = {
        constructor: TimePicker,
        init: function () {
            var _this = this;
            this.initState();
            this.bindElem.addEventListener('click', function(e) {
                _this.openPanel(this);
                e.stopPropagation();
            }, false);
        },
        openPanel: function (target) {
            if (utils.hasClass(target, TimePicker.originOpt.PICKERNAME)) { // 说明该元素已经挂载
                var only_key = utils.attr(target, TimePicker.originOpt.PANELKEY);
                this.elem_wrap = document.querySelector('.' + TimePicker.originOpt.PANELSTR + only_key);
                if (utils.attr(this.elem_wrap, 'isShow') == 'off') utils.show(this.elem_wrap);
                else utils.fadeOut(this.elem_wrap);
            } else {
                this.create(target);
            }
        },
		create: function (target) {
            var only_key = +new Date();
            var div = document.createElement('div');

            utils.attr(target, TimePicker.originOpt.PANELKEY, only_key);
            utils.addClass(target, TimePicker.originOpt.PICKERNAME);

            div.className = TimePicker.originOpt.PANELWRAPCLASS + ' ' + TimePicker.originOpt.PANELSTR + only_key;
            div.innerHTML = this.getTemplate1() + this.getTbodyTemplate(this.timeOpt.hour, this.timeOpt.minute) + this.getTemplate2();
            utils.attr(div, 'isShow', 'on');
            this.elem_wrap = div; // 控件容器
            this.elem_panel = div.children[0]; // 控件面板

            // 设置定位位置
            var elem = target;
            var top = elem.offsetTop;
            var left = elem.offsetLeft;
            while(elem.offsetParent) {
                top += elem.offsetParent.offsetTop;
                left += elem.offsetParent.offsetLeft;
                elem = elem.offsetParent;
            }

            utils.css(this.elem_panel,{
                "position": "absolute",
                 "z-index": 9999,
                 "top": top + target.offsetHeight + 10 + "px",
                 "left": left + "px"
            });

            this.elem_container.appendChild(div);
            this.initEvent();
        },
		getTemplate1: function () {
            var selectTime = utils.formatDate(this.timeOpt.hour + 1) + ':' + utils.formatDate(this.timeOpt.time);
            return '<div class="atie-calendar atie-calendar-timePicker" tabindex="0">' +
                '<div class="atie-calendar-panel">' +
                '<input class="atie-calendar-input " placeholder="请选择日期" style="display:none;" value="' + selectTime + '">' +
                '<div class="atie-calendar-date-panel">' +
                '<div class="atie-calendar-body">' +
                '<table class="atie-calendar-table" cellspacing="0" role="grid">' +
                '<thead>' +
                '<tr role="row">' +
                '<th role="columnheader" title="小时" class="atie-calendar-column-header">' +
                '<span class="atie-calendar-column-header-inner">时</span>' +
                '</th>' +
                '<th role="columnheader" title="分钟" class="atie-calendar-column-header">' +
                '<span class="atie-calendar-column-header-inner">分</span>' +
                '</th>' +
                '</tr>' +
                '</thead>' +
                '<tbody class="atie-calendar-tbody">';
        },
        getTemplate2: function () {
            return '</tbody>' +
                '</table>' +
                '</div>' +
                '<div class="atie-calendar-footer">' +
                '<span class="atie-calendar-footer-btn">' +
                '<a class="atie-calendar-today-btn" role="button" title="'+ this.timeOpt.curHour +'时'+ this.timeOpt.curMinute +'分">当前时间</a>' +
				'<a class="atie-calendar-confirm-btn" role="button" title="确定">确定</a>' +
                '</span>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '</div>';
        },
		getTbodyTemplate: function () {
			var htmlMinute="";
			var htmlHour="";
			for(i=0;i<24;i++){
           if (i<10) i = "0" + i;
				var className = 'atie-calendar-hour';
				if (this.timeOpt.hour == i) className = 'atie-calendar-now-hour';
				htmlHour += '<tr><div class="atie-calendar-cell ' + className + '">' + i + '</div></tr>';
			}
			for(i=0;i<60;i++){
           if (i<10) i = "0" + i;
				var className = 'atie-calendar-minute';
				if (this.timeOpt.minute == i) className = 'atie-calendar-now-minute';
				htmlMinute += '<tr><div class="atie-calendar-cell ' + className + '">' + i + '</div></tr>';
			}
            return 	'<tr>' +
					'<td><div class="atie-calendar-hour-body">'+
					'<table>' +
					htmlHour +
					'</table>' +
					'</div></td>'+
					'<td><div class="atie-calendar-minute-body">'+
					'<table>' +
					htmlMinute +
					'</table>' +
					'</div></td>'+
					'</tr>';
        },
        initState: function () {
            var self = this;
			Object.defineProperty(this.timeOpt, 'curHour', {
                get: function () {
                    return new Date().getHours();
                },
            })
			Object.defineProperty(this.timeOpt, 'curMinute', {
                get: function () {
                    return new Date().getMinutes();
                },
            })
            Object.defineProperty(this.timeOpt, 'hour', {
                get: function () {
                    return this._hour;
                },
                set: function (newVal) {
                    this._hour = newVal;
                    self.render();
                }
            })
			Object.defineProperty(this.timeOpt, 'minute', {
                get: function () {
                    return this._minute;
                },
                set: function (newVal) {
                    this._minute = newVal;
                    self.render();
                }
            })
        },
        initEvent: function () {
            var self = this;
            this.elem_wrap.addEventListener('click', function (e) {
                e.stopPropagation();
                var target = e.target;
                if (utils.hasClass(target, TimePicker.Opt.classN)) {
                    self.openPanel(target);
                } else if (utils.hasClass(target, 'atie-calendar-hour')) {
                    self.handleSelect1(target);
				} else if (utils.hasClass(target, 'atie-calendar-minute')) {
                    self.handleSelect2(target);
				} else if (utils.hasClass(target, 'atie-calendar-today-btn')) {
                    self.turnToNow(target);
                } else if (utils.hasClass(target, 'atie-calendar-confirm-btn')) {
                    self.confirmUpdate(target);
                }
            }, false);
            document.addEventListener('click', function() {
                utils.fadeOut(self.elem_wrap);
            }, false);
            // 点击遮罩隐藏
            // this.elem_mask.addEventListener('click', function() {
            //     utils.fadeOut(self.elem_wrap);
            // }, false);
            // 表单输入
            this.elem_wrap.addEventListener('input', function (e) {
                var target = e.target;
                if (utils.hasClass(target, 'atie-calendar-input')) {
                    self.handleInput(target);
                }
            }, false);
        },
        updateHtml: function () {
            if (this.isSelected) {
                this.timeOpt.selectHour = this.timeOpt.hour;
                this.timeOpt.selectMinute = this.timeOpt.minute;
                this.elem_wrap.querySelector('.atie-calendar-input ').value = utils.formatDate(this.timeOpt._hour) + ':' + utils.formatDate(this.timeOpt._minute);
                // callback
                TimePicker.Opt.callBack && TimePicker.Opt.callBack(this.bindElem, {
                    hour: this.timeOpt.selectHour,
                    minute: this.timeOpt.selectMinute
                });
            }
            this.elem_wrap.querySelector('tbody').innerHTML = this.getTbodyTemplate();
                    var obj1 = this.elem_wrap.querySelector(".atie-calendar-now-hour"); //将选中数字置顶
					this.elem_wrap.querySelector(".atie-calendar-hour-body").scrollTop = obj1.offsetTop; //将选中数字置顶
          var obj2 = this.elem_wrap.querySelector(".atie-calendar-now-minute"); //将选中数字置顶
					this.elem_wrap.querySelector(".atie-calendar-minute-body").scrollTop = obj2.offsetTop; //将选中数字置顶

            this.resetOnoff();
        },
        // 重置开关状态
        resetOnoff: function () {
            this.isSelected = false;
            this.isHourChange = false;
            this.isMinuteChange = false;
        },
        render: function () {
            if (this.timer) return;
            var self = this;

            var fn = function () {
                if (self.isSelected) {
                    // 渲染1、4
                    self.updateHtml('timeChange');
                }
                self.timer = null;
            }
            // 宏任务渲染
            if (typeof setImmediate !== 'undefined') {
                self.timer = setImmediate(fn);
            } else {
                self.timer = setTimeout(fn, 0);
            }
        },
		handleSelect1: function (target) {
            this.isSelected = true;
            var parentElem = target.parentNode;
            this.timeOpt.hour = parseInt(target.innerHTML);
        },
		handleSelect2: function (target) {
            this.isSelected = true;
            var parentElem = target.parentNode;
            this.timeOpt.minute = parseInt(target.innerHTML);
        },
		confirmUpdate: function(target) {
			this.isSelected = true;
			utils.fadeOut(this.elem_wrap);
		},
        turnToNow: function () {
            this.isSelected = true;
            var date = new Date();
            this.timeOpt.hour = date.getHours();
            this.timeOpt.minute = date.getMinutes();
            utils.fadeOut(this.elem_wrap);
        },
        handleInput: function (target) {
            var value = target.value;
            var reg = /^(0[1-9]|1[0-2]):(0[1-9]|[1-2][0-9]|3[0-1])$/;
            var regExp = new RegExp(reg);
            if (regExp.test(value)) {
                dateArr = value.split(':');
                this.isSelected = true;
                this.timeOpt.hour = parseInt(dateArr[0]);
                this.timeOpt.minute = parseInt(dateArr[1]);
            }
        }
    }
	function Calendar(elem) {
        // 参数
        this.bindElem = elem; // 绑定的元素
        this.elem_wrap = null; // calendar-wrap
        this.timer = null; // 本插件异步全都用macroTask中的setTimeout来处理
        this.isSelected = false; // 是否触发了选择日期动作
        this.isYearChange = false; // 是否触发了切换年
        this.isMonthChange = false; // 是否触发了切换月份
        var date = new Date();
        this.dateOpt = {
            _year: date.getFullYear(),
            _month: date.getMonth(),
            _date: date.getDate(),
            selectYear: date.getFullYear(),
            selectMonth: date.getMonth(),
            selectDate: date.getDate(),
        }

        this.elem_container = document.querySelector('body');
        this.init();

    };
    Calendar.create = function(opt) {
        for(var prop in opt){
            Calendar.Opt[prop] = opt[prop];
        };
        var elemArr = document.getElementsByClassName(Calendar.Opt.classN);

        for(var i=0;i<elemArr.length;i++){
            elemArr[i].calendar = new Calendar(elemArr[i]);
        }
    }
    Calendar.originOpt = {
        PICKERNAME: 'calendar-btn',
        PANELKEY: 'self-panel-key', // 存储picker对应的calendar的唯一key
        PANELSTR: 'calendar-panel_',
        PANELWRAPCLASS: 'calendar-wrap'
    }
    Calendar.Opt = {
        classN: '',
        callBack: function(bindElem, selectDate) {}
    };
    Calendar.version = '1.0.0';

    Calendar.prototype = {
        constructor: Calendar,
        init: function () {
            var _this = this;
            this.initState();
            this.bindElem.addEventListener('click', function(e) {
                _this.openPanel(this);
                e.stopPropagation();
            }, false);
        },
        openPanel: function (target) {
            if (utils.hasClass(target, Calendar.originOpt.PICKERNAME)) { // 说明该元素已经挂载
                var only_key = utils.attr(target, Calendar.originOpt.PANELKEY);
                this.elem_wrap = document.querySelector('.' + Calendar.originOpt.PANELSTR + only_key);
                if (utils.attr(this.elem_wrap, 'isShow') == 'off') utils.show(this.elem_wrap);
                else utils.fadeOut(this.elem_wrap);
            } else {
                this.create(target);
            }
        },
        create: function (target) {
            var only_key = +new Date();
            var div = document.createElement('div');

            utils.attr(target, Calendar.originOpt.PANELKEY, only_key);
            utils.addClass(target, Calendar.originOpt.PICKERNAME);

            div.className = Calendar.originOpt.PANELWRAPCLASS + ' ' + Calendar.originOpt.PANELSTR + only_key;
            div.innerHTML = this.getTemplate1() + this.getTbodyTemplate(this.dateOpt.year, this.dateOpt.month) + this.getTemplate2();
            utils.attr(div, 'isShow', 'on');
            this.elem_wrap = div; // 控件容器
            this.elem_panel = div.children[0]; // 控件面板

            // 设置定位位置
            var elem = target;
            var top = elem.offsetTop;
            var left = elem.offsetLeft;
            while(elem.offsetParent) {
                top += elem.offsetParent.offsetTop;
                left += elem.offsetParent.offsetLeft;
                elem = elem.offsetParent;
            }

            utils.css(this.elem_panel,{
                "position": "absolute",
                 "z-index": 9999,
                 "top": top + target.offsetHeight + 10 + "px",
                 "left": left + "px"
            });

            this.elem_container.appendChild(div);
            this.initEvent();
        },
        getTemplate1: function () {
            var selectDate = this.dateOpt.year + '-' + utils.formatDate(this.dateOpt.month + 1) + '-' + utils.formatDate(this.dateOpt.date);
            return '<div class="atie-calendar atie-calendar-datePicker" tabindex="0">' +
                '<div class="atie-calendar-panel">' +
                '<input class="atie-calendar-input " placeholder="请选择日期" style="display:none;" value="' + selectDate + '">' +
                '<div class="atie-calendar-date-panel">' +
                '<div class="atie-calendar-header">' +
                '<div style="position: relative;">' +
                '<a class="atie-calendar-prev-year-btn" role="button" title="上一年"><<</a>' +
                '<a class="atie-calendar-prev-month-btn" role="button" title="上个月"><</a>' +
                '<span class="atie-calendar-ym-select">' +
                '<a class="atie-calendar-year-select" role="button">' + this.dateOpt.year + '年</a>' +
                '<a class="atie-calendar-month-select" role="button">' + (this.dateOpt.month + 1) + '月</a>' +
                '</span>' +
                '<a class="atie-calendar-next-month-btn" title="下个月">></a>' +
                '<a class="atie-calendar-next-year-btn" title="下一年">>></a>' +
                '</div>' +
                '</div>' +
                '<div class="atie-calendar-body">' +
                '<table class="atie-calendar-table" cellspacing="0" role="grid">' +
                '<thead>' +
                '<tr role="row">' +
                '<th role="columnheader" title="周一" class="atie-calendar-column-header">' +
                '<span class="atie-calendar-column-header-inner">一</span>' +
                '</th>' +
                '<th role="columnheader" title="周二" class="atie-calendar-column-header">' +
                '<span class="atie-calendar-column-header-inner">二</span>' +
                '</th>' +
                '<th role="columnheader" title="周三" class="atie-calendar-column-header">' +
                '<span class="atie-calendar-column-header-inner">三</span>' +
                '</th>' +
                '<th role="columnheader" title="周四" class="atie-calendar-column-header">' +
                '<span class="atie-calendar-column-header-inner">四</span>' +
                '</th>' +
                '<th role="columnheader" title="周五" class="atie-calendar-column-header">' +
                '<span class="atie-calendar-column-header-inner">五</span>' +
                '</th>' +
                '<th role="columnheader" title="周六" class="atie-calendar-column-header">' +
                '<span class="atie-calendar-column-header-inner">六</span>' +
                '</th>' +
                '<th role="columnheader" title="周日" class="atie-calendar-column-header">' +
                '<span class="atie-calendar-column-header-inner">日</span>' +
                '</th>' +
                '</tr>' +
                '</thead>' +
                '<tbody class="atie-calendar-tbody">';
        },
        getTemplate2: function () {
            return '</tbody>' +
                '</table>' +
                '</div>' +
                '<div class="atie-calendar-footer">' +
                '<span class="atie-calendar-footer-btn">' +
                '<a class="atie-calendar-today-btn " role="button" title="'+ this.dateOpt.curYear +'年'+ (this.dateOpt.curMonth + 1) +'月'+ this.dateOpt.curDate +'日">今天</a>' +
                '</span>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '</div>';
        },
        getTbodyTemplate: function () {
            // 当月第一天日期对象
            var currentMonthFirstDateObj = new Date(this.dateOpt.year, this.dateOpt.month, 1);
            // 当月第一天星期
            var currentMonthFirstDay = currentMonthFirstDateObj.getDay() || 7;
            // 当月最后一天日期对象
            var currentMonthLastDateObj = new Date(this.dateOpt.year, this.dateOpt.month + 1, 0);
            // 当月最后一天日期
            var currentMonthLastDay = currentMonthLastDateObj.getDate();
            // 上个月最后一天日期对象
            var lastMonthLastDateObj = new Date(this.dateOpt.year, this.dateOpt.month, 0);
            // 上个月最后一天日期
            var lastMonthLastDate = lastMonthLastDateObj.getDate();

            var html = '';
            for (var i = 1; i <= 42; i++) {
                if (i % 7 === 1) {
                    html += '<tr>'
                }
                var date = '';
                var className = '';
                if (i < currentMonthFirstDay) {
                    date = lastMonthLastDate - currentMonthFirstDay + i + 1;
                    className = 'atie-calendar-last-month-cell';
                } else if (i > currentMonthFirstDay + currentMonthLastDay - 1) {
                    date = i - currentMonthFirstDay - currentMonthLastDay + 1;
                    className = 'atie-calendar-next-month-btn-day';
                } else {
                    // 今天
                    date = i - currentMonthFirstDay + 1;
                    if (this.dateOpt.year === this.dateOpt.curYear &&
                        this.dateOpt.month === this.dateOpt.curMonth &&
                        this.dateOpt.curDate === date) className = 'atie-calendar-cell atie-calendar-today';
                    if (this.dateOpt.selectYear === this.dateOpt.year && this.dateOpt.selectMonth === this.dateOpt.month && this.dateOpt.selectDate === date) className += ' atie-calendar-selected-date';
                    if (this.dateOpt.date === date) className += ' atie-calendar-selected-day';
                }
                html += '<td class="atie-calendar-cell ' + className + '"><div class="atie-calendar-date">' + date + '</div></td>';

                if (i % 7 === 7) {
                    html += '</tr>'
                }
            }
            return html;
        },
        initState: function () {
            var self = this;
            Object.defineProperty(this.dateOpt, 'curYear', {
                get: function () {
                    return new Date().getFullYear();
                },
            })
            Object.defineProperty(this.dateOpt, 'curMonth', {
                get: function () {
                    return new Date().getMonth();
                },
            })
            Object.defineProperty(this.dateOpt, 'curDate', {
                get: function () {
                    return new Date().getDate();
                },
            })
            Object.defineProperty(this.dateOpt, 'year', {
                get: function () {
                    return this._year;
                },
                set: function (newVal) {
                    if (newVal === this._year) return;
                    this._year = newVal;
                    self.isYearChange = true;
                    self.render()
                }
            })
            Object.defineProperty(this.dateOpt, 'month', {
                get: function () {
                    return this._month;
                },
                set: function (newVal) {
                    if (newVal > 11) {
                        this.year++;
                        this._month = 0;
                    } else if (newVal < 0) {
                        this.year--;
                        this._month = 11;
                    } else this._month = newVal;
                    self.isMonthChange = true;
                    self.render()
                }
            })
            Object.defineProperty(this.dateOpt, 'date', {
                get: function () {
                    return this._date;
                },
                set: function (newVal) {
                    this._date = newVal;
                    self.render();
                }
            })
        },
        initEvent: function () {
            var self = this;
            this.elem_wrap.addEventListener('click', function (e) {
                e.stopPropagation();
                var target = e.target;
                if (utils.hasClass(target, Calendar.Opt.classN)) {
                    self.openPanel(target);
                } else if (utils.hasClass(target, 'atie-calendar-next-month-btn')) {
                    self.dateOpt.month++;
                } else if (utils.hasClass(target, 'atie-calendar-prev-month-btn')) {
                    self.dateOpt.month--;
                } else if (utils.hasClass(target, 'atie-calendar-next-year-btn')) {
                    self.dateOpt.year++;
                } else if (utils.hasClass(target, 'atie-calendar-prev-year-btn')) {
                    self.dateOpt.year--;
                } else if (utils.hasClass(target, 'atie-calendar-date')) {
                    self.handleSelect(target);
                } else if (utils.hasClass(target, 'atie-calendar-today-btn')) {
                    self.turnToToday(target);
                }
            }, false);
            document.addEventListener('click', function() {
                utils.fadeOut(self.elem_wrap);
            }, false);
            // 点击遮罩隐藏
            // this.elem_mask.addEventListener('click', function() {
            //     utils.fadeOut(self.elem_wrap);
            // }, false);
            // 表单输入
            this.elem_wrap.addEventListener('input', function (e) {
                var target = e.target;
                if (utils.hasClass(target, 'atie-calendar-input')) {
                    self.dateHandleInput(target);
                }
            }, false);
        },
        updateHtml: function (type) {
            console.log('updateHtml type=>', type);
            switch (type) {
                case 'yearChange':
                    this.elem_wrap.querySelector('.atie-calendar-year-select').innerHTML = this.dateOpt._year + '年';
                    this.elem_wrap.querySelector('.atie-calendar-month-select').innerHTML = this.dateOpt._month + 1 + '月';
                    break;
                case 'monthChange':
                    this.elem_wrap.querySelector('.atie-calendar-month-select').innerHTML = this.dateOpt._month + 1 + '月';
                    break;
                default:
            }
            if (this.isSelected) {
                this.dateOpt.selectYear = this.dateOpt.year;
                this.dateOpt.selectMonth = this.dateOpt.month;
                this.dateOpt.selectDate = this.dateOpt.date;
                this.elem_wrap.querySelector('.atie-calendar-input ').value = this.dateOpt._year + '-' + utils.formatDate(this.dateOpt._month + 1) + '-' + utils.formatDate(this.dateOpt._date);
                // callback
                Calendar.Opt.callBack && Calendar.Opt.callBack(this.bindElem, {
                    year: this.dateOpt.selectYear,
                    month: this.dateOpt.selectMonth + 1,
                    date: this.dateOpt.selectDate
                });
            }
            this.elem_wrap.querySelector('tbody').innerHTML = this.getTbodyTemplate();
            this.resetOnoff();
        },
        // 重置开关状态
        resetOnoff: function () {
            this.isSelected = false;
            this.isMonthChange = false;
            this.isYearChange = false;
        },
        render: function () {
            if (this.timer) return;
            var self = this;

            var fn = function () {
                if (self.isYearChange) {
                    // 渲染1、2、3、4
                    self.updateHtml('yearChange');
                } else if (self.isMonthChange) {
                    // 渲染1、3、4
                    self.updateHtml('monthChange');
                } else if (self.isSelected) {
                    // 渲染1、4
                    self.updateHtml('dateChange');
                }
                self.timer = null;
            }
            // 宏任务渲染
            if (typeof setImmediate !== 'undefined') {
                self.timer = setImmediate(fn);
            } else {
                self.timer = setTimeout(fn, 0);
            }
        },
        handleSelect: function (target) {
            this.isSelected = true;
            var parentElem = target.parentNode;
            this.dateOpt.date = parseInt(target.innerHTML);
            if (utils.hasClass(parentElem, 'atie-calendar-next-month-btn-day')) {
                this.dateOpt.month++;
            } else if (utils.hasClass(parentElem, 'atie-calendar-last-month-cell')) {
                this.dateOpt.month--;
            }
            utils.fadeOut(this.elem_wrap);
        },
        turnToToday: function () {
            this.isYearChange = true;
            this.isSelected = true;
            var date = new Date();
            this.dateOpt.year = date.getFullYear();
            this.dateOpt.month = date.getMonth();
            this.dateOpt.date = date.getDate();
            utils.fadeOut(this.elem_wrap);
        },
        dateHandleInput: function (target) {
            var value = target.value;
            var reg = /^[1-9]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[1-2][0-9]|3[0-1])$/;
            var regExp = new RegExp(reg);
            if (regExp.test(value)) {
                dateArr = value.split('-');
                this.isYearChange = true;
                this.isSelected = true;
                this.dateOpt.date = parseInt(dateArr[2]);
                this.dateOpt.month = parseInt(dateArr[1]) - 1;
                this.dateOpt.year = parseInt(dateArr[0]);
            }
        }
    }
    window.Calendar = Calendar;
    window.TimePicker = TimePicker;
})()
