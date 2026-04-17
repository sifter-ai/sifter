"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SiftHandle = void 0;
var errors_js_1 = require("./errors.js");
var SiftHandle = /** @class */ (function () {
    function SiftHandle(data, apiUrl, headers, fetchFn) {
        this._data = data;
        this.id = String(data["id"]);
        this._apiUrl = apiUrl;
        this._headers = headers;
        this._fetch = fetchFn;
    }
    Object.defineProperty(SiftHandle.prototype, "name", {
        get: function () { var _a; return String((_a = this._data["name"]) !== null && _a !== void 0 ? _a : ""); },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(SiftHandle.prototype, "status", {
        get: function () { var _a; return String((_a = this._data["status"]) !== null && _a !== void 0 ? _a : ""); },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(SiftHandle.prototype, "defaultFolderId", {
        get: function () {
            var v = this._data["default_folder_id"];
            return v == null ? null : String(v);
        },
        enumerable: false,
        configurable: true
    });
    SiftHandle.prototype.records = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            var params, res, data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        params = new URLSearchParams();
                        if (options === null || options === void 0 ? void 0 : options.cursor)
                            params.set("cursor", options.cursor);
                        else if ((options === null || options === void 0 ? void 0 : options.offset) != null)
                            params.set("offset", String(options.offset));
                        if ((options === null || options === void 0 ? void 0 : options.limit) != null)
                            params.set("limit", String(options.limit));
                        return [4 /*yield*/, this._fetch("".concat(this._apiUrl, "/api/sifts/").concat(this.id, "/records?").concat(params), { headers: this._headers })];
                    case 1:
                        res = _a.sent();
                        return [4 /*yield*/, (0, errors_js_1.assertOk)(res)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, res.json()];
                    case 3:
                        data = _a.sent();
                        return [2 /*return*/, data.items];
                }
            });
        });
    };
    SiftHandle.prototype.find = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            var params, res, data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        params = new URLSearchParams();
                        if (options === null || options === void 0 ? void 0 : options.filter)
                            params.set("filter", JSON.stringify(options.filter));
                        if (options === null || options === void 0 ? void 0 : options.sort)
                            params.set("sort", JSON.stringify(options.sort));
                        if (options === null || options === void 0 ? void 0 : options.cursor)
                            params.set("cursor", options.cursor);
                        if ((options === null || options === void 0 ? void 0 : options.limit) != null)
                            params.set("limit", String(options.limit));
                        if (options === null || options === void 0 ? void 0 : options.project)
                            params.set("project", JSON.stringify(options.project));
                        return [4 /*yield*/, this._fetch("".concat(this._apiUrl, "/api/sifts/").concat(this.id, "/records?").concat(params), { headers: this._headers })];
                    case 1:
                        res = _a.sent();
                        return [4 /*yield*/, (0, errors_js_1.assertOk)(res)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, res.json()];
                    case 3:
                        data = _a.sent();
                        return [2 /*return*/, { records: data.items, next_cursor: data.next_cursor }];
                }
            });
        });
    };
    SiftHandle.prototype.aggregate = function (pipeline) {
        return __awaiter(this, void 0, void 0, function () {
            var res, data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this._fetch("".concat(this._apiUrl, "/api/sifts/").concat(this.id, "/aggregate"), {
                            method: "POST",
                            headers: __assign(__assign({}, this._headers), { "Content-Type": "application/json" }),
                            body: JSON.stringify({ pipeline: pipeline }),
                        })];
                    case 1:
                        res = _a.sent();
                        return [4 /*yield*/, (0, errors_js_1.assertOk)(res)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, res.json()];
                    case 3:
                        data = _a.sent();
                        return [2 /*return*/, data.results];
                }
            });
        });
    };
    SiftHandle.prototype.recordsCount = function (filter) {
        return __awaiter(this, void 0, void 0, function () {
            var params, res, data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        params = new URLSearchParams();
                        if (filter)
                            params.set("filter", JSON.stringify(filter));
                        return [4 /*yield*/, this._fetch("".concat(this._apiUrl, "/api/sifts/").concat(this.id, "/records/count?").concat(params), { headers: this._headers })];
                    case 1:
                        res = _a.sent();
                        return [4 /*yield*/, (0, errors_js_1.assertOk)(res)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, res.json()];
                    case 3:
                        data = _a.sent();
                        return [2 /*return*/, data.count];
                }
            });
        });
    };
    SiftHandle.prototype.recordsByIds = function (ids) {
        return __awaiter(this, void 0, void 0, function () {
            var res, data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this._fetch("".concat(this._apiUrl, "/api/sifts/").concat(this.id, "/records/batch"), {
                            method: "POST",
                            headers: __assign(__assign({}, this._headers), { "Content-Type": "application/json" }),
                            body: JSON.stringify({ ids: ids }),
                        })];
                    case 1:
                        res = _a.sent();
                        return [4 /*yield*/, (0, errors_js_1.assertOk)(res)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, res.json()];
                    case 3:
                        data = _a.sent();
                        return [2 /*return*/, data.items];
                }
            });
        });
    };
    SiftHandle.prototype.extract = function (documentId) {
        return __awaiter(this, void 0, void 0, function () {
            var res;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this._fetch("".concat(this._apiUrl, "/api/sifts/").concat(this.id, "/extract"), {
                            method: "POST",
                            headers: __assign(__assign({}, this._headers), { "Content-Type": "application/json" }),
                            body: JSON.stringify({ document_id: documentId }),
                        })];
                    case 1:
                        res = _a.sent();
                        return [4 /*yield*/, (0, errors_js_1.assertOk)(res)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, res.json()];
                }
            });
        });
    };
    SiftHandle.prototype.extractionStatus = function (documentId) {
        return __awaiter(this, void 0, void 0, function () {
            var params, res, data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        params = new URLSearchParams({ document_id: documentId });
                        return [4 /*yield*/, this._fetch("".concat(this._apiUrl, "/api/sifts/").concat(this.id, "/extraction-status?").concat(params), { headers: this._headers })];
                    case 1:
                        res = _a.sent();
                        return [4 /*yield*/, (0, errors_js_1.assertOk)(res)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, res.json()];
                    case 3:
                        data = _a.sent();
                        return [2 /*return*/, data.status];
                }
            });
        });
    };
    SiftHandle.prototype.query = function (naturalLanguage_1) {
        return __awaiter(this, arguments, void 0, function (naturalLanguage, execute) {
            var res;
            if (execute === void 0) { execute = true; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this._fetch("".concat(this._apiUrl, "/api/sifts/").concat(this.id, "/query"), {
                            method: "POST",
                            headers: __assign(__assign({}, this._headers), { "Content-Type": "application/json" }),
                            body: JSON.stringify({ query: naturalLanguage, execute: execute }),
                        })];
                    case 1:
                        res = _a.sent();
                        return [4 /*yield*/, (0, errors_js_1.assertOk)(res)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, res.json()];
                }
            });
        });
    };
    SiftHandle.prototype.schema = function () {
        return __awaiter(this, void 0, void 0, function () {
            var res;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this._fetch("".concat(this._apiUrl, "/api/sifts/").concat(this.id, "/schema"), { headers: this._headers })];
                    case 1:
                        res = _a.sent();
                        return [4 /*yield*/, (0, errors_js_1.assertOk)(res)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, res.json()];
                }
            });
        });
    };
    SiftHandle.prototype.update = function (fields) {
        return __awaiter(this, void 0, void 0, function () {
            var res, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this._fetch("".concat(this._apiUrl, "/api/sifts/").concat(this.id), {
                            method: "PATCH",
                            headers: __assign(__assign({}, this._headers), { "Content-Type": "application/json" }),
                            body: JSON.stringify(fields),
                        })];
                    case 1:
                        res = _b.sent();
                        return [4 /*yield*/, (0, errors_js_1.assertOk)(res)];
                    case 2:
                        _b.sent();
                        _a = this;
                        return [4 /*yield*/, res.json()];
                    case 3:
                        _a._data = (_b.sent());
                        return [2 /*return*/, this];
                }
            });
        });
    };
    SiftHandle.prototype.delete = function () {
        return __awaiter(this, void 0, void 0, function () {
            var res;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this._fetch("".concat(this._apiUrl, "/api/sifts/").concat(this.id), { method: "DELETE", headers: this._headers })];
                    case 1:
                        res = _a.sent();
                        return [4 /*yield*/, (0, errors_js_1.assertOk)(res)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    SiftHandle.prototype.exportCsv = function () {
        return __awaiter(this, void 0, void 0, function () {
            var res;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this._fetch("".concat(this._apiUrl, "/api/sifts/").concat(this.id, "/records/csv"), { headers: this._headers })];
                    case 1:
                        res = _a.sent();
                        return [4 /*yield*/, (0, errors_js_1.assertOk)(res)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, res.text()];
                }
            });
        });
    };
    return SiftHandle;
}());
exports.SiftHandle = SiftHandle;
