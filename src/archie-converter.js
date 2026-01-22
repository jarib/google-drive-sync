import archieml from 'archieml';
import archiemlNew from 'archieml-new';
import htmlparser from 'htmlparser2';
import urlm from 'url';
import _ from 'underscore';
import debug from 'debug';

import { AllHtmlEntities as Entities } from 'html-entities';

const log = debug('google-drive-sync:archie-converter');

export default class ArchieConverter {
    static convert(html, options = {}) {
        return this.parseHtml(html, options).then((aml) => {
            try {
                // Fix missing newlines before ArchieML directives for version 0.5.0
                // This ensures directives like [array] and :skip are on their own lines
                if (options.useNewVersion) {
                    aml = aml.replace(/([^\n])(\[[\w\.\+\-]+\]|:\w+)/g, '$1\n$2');
                }
                
                const archiemlLib = options.useNewVersion ? archiemlNew : archieml;
                return {
                    result: archiemlLib.load(aml),
                    aml: aml,
                };
            } catch (err) {
                err.isArchieMLError = true;
                err.aml = aml;

                throw err;
            }
        });
    }

    static convertText(aml, options = {}) {
        const archiemlLib = options.useNewVersion ? archiemlNew : archieml;
        return Promise.resolve({ result: archiemlLib.load(aml) });
    }

    static parseHtml(str, options = {}) {
        return new Promise((resolve, reject) => {
            const handler = new htmlparser.DomHandler((error, dom) => {
                if (error) {
                    reject(error);
                }

                var html = _.find(dom, (t) => t.name === 'html');
                var head = _.find(html.children, (t) => t.name === 'head');
                var body = _.find(html.children, (t) => t.name === 'body');
                var style = _.find(head.children, (t) => t.name === 'style');
                var styleData = style ? style.children[0].data : '';

                var style_config = {};
                if (options.preserve_styles) {
                    if (_.include(options.preserve_styles, 'bold')) {
                        style_config['font-weight:bold'] = {
                            className: 'g-doc-bold',
                            tag: 'strong',
                        };
                    }
                    if (_.include(options.preserve_styles, 'italic')) {
                        style_config['font-style:italic'] = {
                            className: 'g-doc-italic',
                            tag: 'em',
                        };
                    }
                    if (_.include(options.preserve_styles, 'underline')) {
                        style_config['text-decoration:underline'] = {
                            className: 'g-doc-underline',
                            tag: 'u',
                        };
                    }
                }

                var tagHandlers = {
                    _base: function (tag) {
                        var components = [],
                            func;

                        _.each(tag.children, function (child) {
                            if ((func = tagHandlers[child.name || child.type])) {
                                var component = {
                                    value: func(child),
                                    tags: [],
                                    classes: [],
                                };

                                let tag_styles;

                                if (tag.attribs && tag.attribs.style) {
                                    tag_styles = _.intersection(
                                        tag.attribs.style.split(';'),
                                        Object.keys(style_config)
                                    );
                                    if (tag_styles.length > 0) {
                                        // Three scenarios: the bold/italic value takes up:
                                        //   * The entire line (ignore)
                                        //   * The entire value (use a wrapper span)
                                        //   * A partial value (use standard tag)
                                        //  [* multi-line values, which we'll ignore for now since
                                        //     they wouldn't translate into correct HTML anyway]
                                        if (
                                            tag.next === null &&
                                            tag.prev === null &&
                                            tag.parent.name === 'p'
                                        ) {
                                            // entire line, ignore
                                            log('ignored entire line', component);
                                        } else if (
                                            tag.next === null &&
                                            tag.prev !== null
                                        ) {
                                            // partial line, use strong/em
                                            component.classes = _.unique(
                                                _.flatten(
                                                    _.map(
                                                        tag_styles,
                                                        function (style) {
                                                            return style_config[
                                                                style
                                                            ].className;
                                                        }
                                                    )
                                                )
                                            );

                                            log('partial line', component);
                                        } else if (
                                            tag.next !== null &&
                                            tag.prev === null
                                        ) {
                                            // partial line — key is formatted but text is not
                                            log(
                                                'partial line, key formatted but text is not',
                                                component
                                            );
                                        } else {
                                            // entire value, use class
                                            component.tags = _.unique(
                                                _.flatten(
                                                    _.map(
                                                        tag_styles,
                                                        function (style) {
                                                            return style_config[
                                                                style
                                                            ].tag;
                                                        }
                                                    )
                                                )
                                            );

                                            log('entire value', component);
                                        }

                                        // Remove underline tag and class from links
                                        var underline_tags;
                                        if (
                                            style_config &&
                                            tag.children.length === 1 &&
                                            tag.children[0].name === 'a' &&
                                            (underline_tags =
                                                style_config[
                                                    'text-decoration:underline'
                                                ] || [])
                                        ) {
                                            component.classes = _.without(
                                                component.classes,
                                                underline_tags[0]
                                            );
                                            component.tags = _.without(
                                                component.tags,
                                                underline_tags[1]
                                            );
                                        }
                                    }
                                }

                                components.push(component);
                            }
                        });

                        return components;
                    },
                    text: function (textTag) {
                        return [
                            {
                                value: textTag.data,
                            },
                        ];
                    },
                    span: function (spanTag) {
                        return tagHandlers._base(spanTag);
                    },
                    p: function (pTag) {
                        var vals = tagHandlers._base(pTag);
                        _.last(vals).newline = true;
                        return vals;
                    },
                    a: function (aTag) {
                        var url = aTag.attribs.href;
                        if (url === undefined) {
                            return {
                                value: '',
                                classes: [],
                                tags: [],
                            };
                        }

                        // extract real URLs from Google's tracking
                        // from: http://www.google.com/url?q=http%3A%2F%2Fwww.nytimes.com%2F2002%2F03%2F15%2Fus%2Fgroups-fight-florida-s-ban-on-gay-adoptions.html&sa=D&sntz=1&usg=AFQjCNGo5tbzMklvR-LGauyvg6J0OFeVCg
                        // to: http://www.nytimes.com/2002/03/15/us/groups-fight-florida-s-ban-on-gay-adoptions.html
                        if (
                            aTag.attribs.href &&
                            urlm.parse(aTag.attribs.href, true).query &&
                            urlm.parse(aTag.attribs.href, true).query.q
                        ) {
                            url = urlm.parse(aTag.attribs.href, true).query.q;
                        }

                        var vals = tagHandlers._base(aTag);
                        vals.unshift({
                            value: '<a href="' + url + '">',
                            classes: [],
                            tags: [],
                        });
                        vals.push({
                            value: '</a>',
                            classes: [],
                            tags: [],
                        });
                        return vals;
                    },
                    li: function (tag) {
                        var vals = tagHandlers._base(tag);
                        _.last(vals).newline = true;
                        var firstString = _.first(vals);
                        while (
                            typeof firstString.value === 'object' &&
                            firstString.value.length > 0
                        ) {
                            firstString = _.first(firstString.value);
                        }
                        firstString.value = '* ' + firstString.value;
                        return vals;
                    },
                    img: function (imgTag) {
                        return [
                            {
                                value: imgTag.attribs.src,
                            },
                        ];
                    },
                };

                ['ul', 'ol'].forEach(function (tag) {
                    tagHandlers[tag] = tagHandlers.span;
                });
                ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach(function (tag) {
                    tagHandlers[tag] = tagHandlers.p;
                });

                function flattenComponents(components) {
                    components = _.map(components, function (component, index) {
                        if (typeof component.value === 'string') {
                            // nothing
                        } else if (
                            typeof component.value === 'undefined' ||
                            component.value === null ||
                            component.value.length === 0
                        ) {
                            return undefined;
                        } else if (component.value.length === 1) {
                            var flattenedComponent = component.value[0];
                            if (component.newline || flattenedComponent.newline)
                                flattenedComponent.newline = true;
                            flattenedComponent.classes = _.unique(
                                component.classes.concat(
                                    flattenedComponent.classes || []
                                )
                            ).sort();
                            flattenedComponent.tags = _.unique(
                                component.tags.concat(flattenedComponent.tags || [])
                            ).sort();

                            flattenedComponent = flattenComponents([
                                flattenedComponent,
                            ])[0];
                            return flattenedComponent;
                        } else {
                            component.value = flattenComponents(component.value);
                        }
                        return component;
                    });
                    components = _.reject(components, function (component) {
                        if (!component) return true;
                        return (
                            (_.isArray(component.value) &&
                                component.value.length === 0) ||
                            (_.isArray(component.value) &&
                                component.value.length === 1 &&
                                _.isArray(component.value[0].value) &&
                                component.value[0].value.length === 0)
                        );
                    });
                    return components;
                }

                function mergeComponents(components) {
                    components = _.reduce(
                        components,
                        function (memo, component) {
                            var last = _.last(memo);

                            // Merging
                            if (last) {
                                if (
                                    _.isEqual(
                                        last.classes.sort(),
                                        component.classes.sort()
                                    ) &&
                                    _.isEqual(
                                        last.tags.sort(),
                                        component.tags.sort()
                                    )
                                ) {
                                    if (
                                        typeof last.value === 'string' &&
                                        typeof component.value === 'string'
                                    ) {
                                        if (last.newline) last.value += '\n';

                                        component.value =
                                            last.value + component.value;
                                        memo.pop();
                                    } else if (
                                        _.isArray(last.value) &&
                                        _.isArray(component.value)
                                    ) {
                                        if (last.newline)
                                            _.last(last.value).newline = true;

                                        component.value = mergeComponents(
                                            last.value.concat(component.value)
                                        );
                                        memo.pop();
                                    } else {
                                        var array = [];

                                        if (_.isArray(last.value)) {
                                            if (last.newline)
                                                _.last(last.value).newline = true;
                                            array = array.concat(last.value);
                                        } else {
                                            array.push({
                                                value: [_.extend({}, last)],
                                                tags: [],
                                                classes: [],
                                            });
                                        }

                                        if (_.isArray(component.value)) {
                                            array = array.concat(component.value);
                                        } else {
                                            array.push({
                                                value: [_.extend({}, component)],
                                                tags: [],
                                                classes: [],
                                            });
                                        }

                                        component.value = array;
                                        memo.pop();
                                    }
                                }
                            }

                            memo.push(component);
                            return memo;
                        },
                        []
                    );

                    return components;
                }

                function printComponents(components) {
                    var str = '';
                    components.forEach(function (component) {
                        var componentStr = '';

                        if (typeof component.value === 'string') {
                            componentStr += component.value;
                        } else {
                            componentStr += printComponents(component.value);
                        }

                        if (
                            component.tags.length === 0 &&
                            component.classes.length > 0
                        )
                            component.tags.push('span');
                        component.tags.forEach(function (tag, index) {
                            var classes = '';
                            if (index === 0 && tag === 'span')
                                classes =
                                    ' class="' +
                                    component.classes.sort().join(' ') +
                                    '"';

                            componentStr =
                                '<' +
                                tag +
                                classes +
                                '>' +
                                componentStr +
                                '</' +
                                tag +
                                '>';
                        });

                        if (component.newline) componentStr += '\n';
                        str += componentStr;
                    });
                    return str;
                }

                try {
                    var components = tagHandlers._base(body);
                    components = flattenComponents(components);
                    components = mergeComponents(components);
                    var parsedText = printComponents(components);
                } catch (e) {
                    reject(e);
                }

                // Convert html entities into the characters as they exist in the google doc
                var entities = new Entities();
                parsedText = entities.decode(parsedText);

                // Convert non-breaking spaces to 'regular' spaces
                parsedText = parsedText.replace(
                    new RegExp(String.fromCharCode(160), 'g'),
                    ' '
                );

                // Remove smart quotes from inside tags
                parsedText = parsedText.replace(/<[^<>]*>/g, function (match) {
                    return match.replace(/”|“/g, '"').replace(/‘|’/g, "'");
                });

                resolve(parsedText);
            });

            var parser = new htmlparser.Parser(handler);

            parser.write(str);
            parser.done();
        });
    }
}
