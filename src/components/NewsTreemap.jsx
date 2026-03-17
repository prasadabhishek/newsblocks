import React, { useMemo, useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

// Performance Optimization: Singleton canvas for measuring text widths off-screen
// This avoids "Forced Reflow" (layout thrashing) by not querying the DOM for geometric properties.
const getCanvasMeasurement = (() => {
    let canvas = null;
    return (text, font) => {
        if (!canvas) canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = font;
        return context.measureText(text).width;
    };
})();

// Helper to add referral tags to external links
const brandLink = (url) => {
    if (!url) return '#';
    try {
        const u = new URL(url);
        u.searchParams.set('utm_source', 'newsblocks.org');
        u.searchParams.set('utm_medium', 'referral');
        return u.toString();
    } catch (e) {
        return url;
    }
};

const NewsTreemap = ({ data, width, height, selectedStory, onStorySelect }) => {
    const svgRef = useRef(null);
    const [tooltip, setTooltip] = useState({
        visible: false,
        x: 0,
        y: 0,
        content: {},
        locked: false
    });
    const timerRef = useRef(null);
    const tooltipRef = useRef(tooltip);

    useEffect(() => {
        tooltipRef.current = tooltip;
    }, [tooltip]);

    const root = useMemo(() => {
        if (!data || !data.children) return null;

        // Safety: Filter out empty categories to prevent D3 layout crashes
        const filteredData = {
            ...data,
            children: data.children.filter(cat => cat.children && cat.children.length > 0)
        };

        if (filteredData.children.length === 0) return null;

        return d3.hierarchy(filteredData)
            .sum(d => d.citationCount || 1)
            .sort((a, b) => (b.value || 0) - (a.value || 0));
    }, [data]);

    useEffect(() => {
        if (selectedStory && root) {
            const node = root.leaves().find(d => d.data.slug === selectedStory.slug);
            if (node) {
                setTooltip({
                    visible: true,
                    x: node.x0 + (node.x1 - node.x0) / 2,
                    y: node.y0 + (node.y1 - node.y0) / 2,
                    content: node.data,
                    locked: true
                });
            }
        } else if (!selectedStory) {
            setTooltip(prev => ({ ...prev, visible: false, locked: false }));
        }
    }, [selectedStory, root]);

    const treemapLayout = useMemo(() => {
        return d3.treemap()
            .size([width, height])
            .paddingInner(2)
            .paddingOuter(4)
            .paddingTop(24)
            .round(true);
    }, [width, height]);

    useEffect(() => {
        if (!svgRef.current || !root) return;

        treemapLayout(root);

        const svg = d3.select(svgRef.current);
        const colorScale = d3.scaleLinear()
            .domain([-1, -0.6, -0.1, 0, 0.1, 0.6, 1])
            .range(['#ef4444', '#b91c1c', '#4d0a0a', '#1e293b', '#064e1c', '#15803d', '#22c55e']);

        const t = d3.transition().duration(750).ease(d3.easeCubicOut);

        // --- 1. LEAVES (Interactive Blocks) ---
        // Create a defs section if not exists
        let defs = svg.select('defs');
        if (defs.empty()) defs = svg.append('defs');

        const leavesData = root.leaves();
        const leaf = svg.selectAll('.leaf-node')
            .data(leavesData, d => d.data.representativeTitle);

        const leafEnter = leaf.enter()
            .append('g')
            .attr('class', 'leaf-node')
            .attr('transform', d => `translate(${d.x0},${d.y0})`)
            .attr('role', 'img')
            .attr('aria-label', d => d.data.representativeTitle);

        leafEnter.append('title').text(d => d.data.representativeTitle);

        leafEnter.append('rect')
            .attr('class', 'bg-rect')
            .attr('stroke', 'rgba(255,255,255,0.05)')
            .attr('stroke-width', 0.5)
            .style('cursor', 'pointer')
            .attr('fill', d => colorScale(d.data.sentiment))
            .on('mouseenter', (event, d) => {
                if (tooltipRef.current.locked) return;
                if (timerRef.current) clearTimeout(timerRef.current);
                timerRef.current = setTimeout(() => {
                    setTooltip({ visible: true, x: event.clientX, y: event.clientY, content: d.data, locked: false });
                }, 40);
            })
            .on('mousemove', (event) => setTooltip(prev => prev.visible && !prev.locked ? { ...prev, x: event.clientX, y: event.clientY } : prev))
            .on('click', (event, d) => {
                event.stopPropagation();
                if (timerRef.current) clearTimeout(timerRef.current);
                onStorySelect(d.data);
            })
            .on('mouseleave', () => {
                if (timerRef.current) clearTimeout(timerRef.current);
                timerRef.current = setTimeout(() => setTooltip(prev => (prev.locked ? prev : { ...prev, visible: false })), 100);
            });

        leafEnter.append('g').attr('class', 'text-group');
        leafEnter.append('text').attr('class', 'source-count')
            .attr('fill', '#94a3b8').attr('font-size', '9px').attr('font-weight', '700')
            .style('font-family', "'Inter', sans-serif").style('pointer-events', 'none');

        // Update
        const leafUpdate = leafEnter.merge(leaf);

        leafUpdate.transition(t)
            .attr('transform', d => `translate(${d.x0},${d.y0})`);

        // Move clipPath to defs for better standards compliance and Safari stability
        leafUpdate.each(function (d) {
            const clipId = `clip-${d.data.slug || d.data.representativeTitle.replace(/[^a-zA-Z0-9]/g, '')}`;
            let clip = defs.select(`#${clipId}`);
            if (clip.empty()) {
                clip = defs.append('clipPath').attr('id', clipId);
                clip.append('rect');
            }
            clip.select('rect').transition(t)
                .attr('x', 0).attr('y', 0)
                .attr('width', Math.max(0, d.x1 - d.x0))
                .attr('height', Math.max(0, d.y1 - d.y0));
        });

        leafUpdate.select('rect.bg-rect').transition(t)
            .attr('width', d => Math.max(0, d.x1 - d.x0))
            .attr('height', d => Math.max(0, d.y1 - d.y0))
            .attr('fill', d => colorScale(d.data.sentiment));

        leafUpdate.select('text.source-count').transition(t)
            .attr('x', 5).attr('y', d => (d.y1 - d.y0) - 8)
            .text(d => {
                const count = d.data.citationCount || (d.data.rawArticles ? d.data.rawArticles.length : 1);
                // Increased depth requirement to avoid overlap with multi-line titles
                return ((d.x1 - d.x0) > 60 && (d.y1 - d.y0) > 65) ? `${count} SOURCES` : '';
            });

        leafUpdate.select('g.text-group').each(function (d) {
            const el = d3.select(this);
            el.selectAll('*').remove();

            const blockWidth = d.x1 - d.x0 - 8;
            const blockHeight = d.y1 - d.y0 - 6;

            let fontSize = 11;
            if (blockWidth < 60 || blockHeight < 40) fontSize = 10;
            if (blockWidth < 45 || blockHeight < 30) fontSize = 9;

            if (blockWidth > 35 && blockHeight > 18) {
                const titleText = d.data.representativeTitle || d.data.title || "";
                const words = titleText.split(/\s+/);
                const fontWeight = fontSize < 10 ? '500' : '600';
                const fontSpec = `${fontWeight} ${fontSize}px 'Inter', sans-serif`;

                const textEl = el.append('text')
                    .attr('clip-path', `url(#clip-${d.data.slug || d.data.representativeTitle.replace(/[^a-zA-Z0-9]/g, '')})`)
                    .attr('x', 5).attr('y', 6 + fontSize * 0.7) // Roughly 6px margin from top to cap-height
                    .attr('fill', '#f8fafc').attr('font-size', `${fontSize}px`)
                    .attr('font-weight', fontWeight)
                    .style('font-family', "'Inter', sans-serif")
                    .style('pointer-events', 'none');

                let line = [];
                let lineNumber = 0;
                const maxLines = blockHeight > 50 ? 3 : (blockHeight > 30 ? 2 : 1);

                let currentLineText = "";

                for (let n = 0; n < words.length; n++) {
                    const testLine = currentLineText ? currentLineText + " " + words[n] : words[n];
                    const testWidth = getCanvasMeasurement(testLine, fontSpec);

                    if (testWidth > blockWidth && n > 0) {
                        // Push current line and start new one
                        textEl.append('tspan')
                            .attr('x', 5).attr('dy', lineNumber === 0 ? '0' : '1.1em')
                            .text(currentLineText);

                        currentLineText = words[n];
                        if (++lineNumber >= maxLines) break;
                    } else {
                        currentLineText = testLine;
                    }
                }

                if (lineNumber < maxLines) {
                    textEl.append('tspan')
                        .attr('x', 5).attr('dy', lineNumber === 0 ? '0' : '1.1em')
                        .text(currentLineText);
                }
            }
        });

        leaf.exit().transition(t).style('opacity', 0).remove();

        // --- 2. CATEGORIES ---
        const cat = svg.selectAll('.category')
            .data(root.children, d => d.data.name);

        const catEnter = cat.enter()
            .append('text')
            .attr('class', 'category')
            .attr('x', d => d.x0 + 5)
            .attr('y', d => d.y0 + 16)
            .attr('fill', 'rgba(255,255,255,0.4)')
            .attr('font-size', '13px')
            .attr('font-weight', '900')
            .style('font-family', "'Inter', sans-serif")
            .style('text-transform', 'uppercase')
            .style('letter-spacing', '0.08em')
            .style('pointer-events', 'none')
            .text(d => d.data.name);

        catEnter.merge(cat)
            .transition(t)
            .attr('x', d => d.x0 + 5)
            .attr('y', d => d.y0 + 16);

        cat.exit().transition(t).style('opacity', 0).remove();

    }, [root, treemapLayout, width, height]);

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    const tooltipStyle = {
        position: 'fixed',
        zIndex: 10000,
        backgroundColor: 'rgba(15, 23, 42, 0.98)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: isMobile ? 'none' : '1px solid rgba(255,255,255,0.15)',
        borderRadius: isMobile ? '24px 24px 0 0' : '16px',
        padding: isMobile ? '24px 20px 40px' : '20px',
        boxShadow: '0 -10px 40px -10px rgba(0, 0, 0, 0.8)',
        color: 'white',
        pointerEvents: tooltip.locked || isMobile ? 'auto' : 'none',
        transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        fontFamily: "'Inter', sans-serif",
        left: isMobile ? '0' : `${tooltip.x + 340 > window.innerWidth ? tooltip.x - 335 : tooltip.x + 15}px`,
        top: isMobile ? 'auto' : `${tooltip.y + 400 > window.innerHeight ? Math.max(10, tooltip.y - 410) : tooltip.y + 15}px`,
        bottom: isMobile ? (tooltip.visible ? '0' : '-100%') : 'auto',
        width: isMobile ? '100%' : '320px',
        maxHeight: isMobile ? '70vh' : '420px',
        opacity: tooltip.visible ? 1 : 0,
        transform: !isMobile && !tooltip.visible ? 'scale(0.95)' : 'none',
        overflowY: 'auto',
        boxSizing: 'border-box'
    };

    const articleItemStyle = {
        display: 'block',
        padding: '12px',
        marginTop: '8px',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        borderRadius: '10px',
        fontSize: '13px',
        textDecoration: 'none',
        color: '#cbd5e1',
        transition: 'all 0.2s ease',
        lineHeight: '1.4'
    };

    return (
        <div className="relative w-full h-full overflow-hidden">
            <svg ref={svgRef} width={width} height={height} className="block" />

            {tooltip.visible && tooltip.content && (
                <div
                    className="no-scrollbar"
                    style={tooltipStyle}
                    onMouseEnter={() => { if (timerRef.current) clearTimeout(timerRef.current); }}
                    onMouseLeave={() => { if (!tooltip.locked) setTooltip(prev => ({ ...prev, visible: false })); }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', gap: '8px' }}>
                        <div style={{ fontWeight: '900', fontSize: '18px', lineHeight: 1.1, fontFamily: "'Roboto Slab', serif", letterSpacing: '-0.02em', color: 'white' }}>
                            {tooltip.content.representativeTitle}
                        </div>
                        {tooltip.locked && (
                            <button onClick={(e) => { e.stopPropagation(); onStorySelect(null); }}
                                style={{
                                    background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: '50%',
                                    width: '24px', height: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', fontSize: '16px', flexShrink: 0
                                }}
                            > × </button>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', backgroundColor: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', letterSpacing: '0.05em' }}>
                            {tooltip.content.citationCount || 1} SOURCES
                        </div>
                        <div style={{
                            fontSize: '10px',
                            fontWeight: '800',
                            color: tooltip.content.sentiment >= 0.1 ? '#4ade80' : tooltip.content.sentiment <= -0.1 ? '#f87171' : '#94a3b8',
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            letterSpacing: '0.05em'
                        }}>
                            {(() => {
                                const s = tooltip.content.sentiment;
                                if (s <= -0.7) return 'STRONG NEGATIVE';
                                if (s <= -0.1) return 'NEGATIVE';
                                if (s >= 0.7) return 'STRONG POSITIVE';
                                if (s >= 0.1) return 'POSITIVE';
                                return 'NEUTRAL';
                            })()}
                        </div>
                    </div>

                    <div className="space-y-2">
                        {tooltip.content.rawArticles?.map((article, idx) => (
                            <a key={idx} href={brandLink(article.link)} target="_blank" rel="noopener noreferrer" style={articleItemStyle}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'; e.currentTarget.style.color = 'white'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)'; e.currentTarget.style.color = '#cbd5e1'; }}
                            >
                                <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '2px', display: 'block' }}>{article.source}</span>
                                {article.title}
                            </a>
                        ))}
                    </div>
                </div>
            )}

            {!root && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-slate-900/50 backdrop-blur-sm">
                    <div className="text-4xl mb-4">💎</div>
                    <h2 className="text-xl font-black text-white mb-2 uppercase tracking-tight">Filtering for High Signal...</h2>
                    <p className="text-slate-400 text-sm max-w-xs">Our AI is currently suppressing low-consensus noise to bring you major news events.</p>
                </div>
            )}
        </div>
    );
};

export default NewsTreemap;
