import fs from 'fs';

const path = './src/components/NewsTreemap.jsx';
let code = fs.readFileSync(path, 'utf8');

const regex = /const colorScale = d3\.scaleLinear\(\)[\s\S]*?(?=\}, \[root, treemapLayout, width, height\]\);)/;

const replacement = `const colorScale = d3.scaleLinear()
            .domain([-1, -0.6, -0.1, 0, 0.1, 0.6, 1])
            .range(['#ef4444', '#b91c1c', '#4d0a0a', '#1e293b', '#064e1c', '#15803d', '#22c55e']);

        const t = d3.transition().duration(750).ease(d3.easeCubicOut);

        // --- 1. LEAVES (Interactive Blocks) ---
        const leavesData = root.leaves();
        const leaf = svg.selectAll('.leaf-node')
            .data(leavesData, d => d.data.representativeTitle);

        const leafEnter = leaf.enter()
            .append('g')
            .attr('class', 'leaf-node')
            .attr('transform', d => \`translate(\${d.x0},\${d.y0})\`)
            .attr('role', 'img')
            .attr('aria-label', d => d.data.representativeTitle);

        leafEnter.append('title').text(d => d.data.representativeTitle);

        leafEnter.append('clipPath')
            .attr('id', (d, i) => \`clip-\${d.data.representativeTitle.replace(/[^a-zA-Z0-9]/g, '')}\`)
            .append('rect');

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
                setTooltip({ visible: true, x: event.clientX, y: event.clientY, content: d.data, locked: true });
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
            .attr('transform', d => \`translate(\${d.x0},\${d.y0})\`);

        leafUpdate.select('clipPath').attr('id', d => \`clip-\${d.data.representativeTitle.replace(/[^a-zA-Z0-9]/g, '')}\`);
        leafUpdate.select('clipPath rect').transition(t)
            .attr('width', d => Math.max(0, d.x1 - d.x0))
            .attr('height', d => Math.max(0, d.y1 - d.y0));

        leafUpdate.select('rect.bg-rect').transition(t)
            .attr('width', d => Math.max(0, d.x1 - d.x0))
            .attr('height', d => Math.max(0, d.y1 - d.y0))
            .attr('fill', d => colorScale(d.data.sentiment));

        leafUpdate.select('text.source-count').transition(t)
            .attr('x', 5).attr('y', d => (d.y1 - d.y0) - 8)
            .text(d => {
                const count = d.data.citationCount || (d.data.rawArticles ? d.data.rawArticles.length : 1);
                return ((d.x1 - d.x0) > 60 && (d.y1 - d.y0) > 55) ? \`\${count} SOURCES\` : '';
            });

        leafUpdate.select('g.text-group').each(function (d) {
            const el = d3.select(this);
            el.selectAll('*').remove(); // Redraw text for correct word wrapping

            const blockWidth = d.x1 - d.x0 - 8;
            const blockHeight = d.y1 - d.y0 - 6;

            let fontSize = 11;
            if (blockWidth < 60 || blockHeight < 40) fontSize = 10;
            if (blockWidth < 45 || blockHeight < 30) fontSize = 9;

            if (blockWidth > 35 && blockHeight > 18) {
                const titleText = d.data.representativeTitle || d.data.title || "";
                const words = titleText.split(/\\s+/);
                let line = [];
                let lineNumber = 0;
                
                const maxLines = blockHeight > 50 ? 3 : (blockHeight > 30 ? 2 : 1);

                const textEl = el.append('text')
                    .attr('clip-path', \`url(#clip-\${d.data.representativeTitle.replace(/[^a-zA-Z0-9]/g, '')})\`)
                    .attr('x', 5).attr('y', 4)
                    .attr('fill', '#f8fafc').attr('font-size', \`\${fontSize}px\`)
                    .attr('font-weight', fontSize < 10 ? '500' : '600')
                    .style('font-family', "'Inter', sans-serif")
                    .style('pointer-events', 'none')
                    .style('dominant-baseline', 'text-before-edge');
                    
                let tspan = textEl.append('tspan').attr('x', 4).attr('dy', '0em');

                for (let n = 0; n < words.length; n++) {
                    line.push(words[n]);
                    tspan.text(line.join(' '));
                    if (tspan.node().getComputedTextLength() > blockWidth) {
                        line.pop();
                        tspan.text(line.join(' '));
                        line = [words[n]];

                        if (++lineNumber < maxLines) {
                            tspan = textEl.append('tspan').attr('x', 4).attr('dy', '1.1em').text(words[n]);
                        } else {
                            if (maxLines > 0) {
                                const lastText = tspan.text();
                                tspan.text(lastText.length > 3 ? lastText.slice(0, -2) + ".." : lastText);
                            }
                            break;
                        }
                    }
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
        
`;

// Also we need to remove svg.selectAll('*').remove();
code = code.replace("svg.selectAll('*').remove();", "// D3 Joins implemented for smooth transitions");
code = code.replace(regex, replacement);

fs.writeFileSync(path, code);
console.log('D3 refactored successfully.');
