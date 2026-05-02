
import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import { Plus, Images, UploadCloud } from 'lucide-react';

export const AdminProducts = () => {
    const [products, setProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [form, setForm] = useState({
        name: '',
        price: '',
        description: '',
        tags: '',
        deliveryTime: '',
    });
    const [coverFile, setCoverFile] = useState(null);
    const [galleryFiles, setGalleryFiles] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        loadProducts();
    }, []);

    const loadProducts = async () => {
        try {
            const data = await api.getProducts();
            setProducts(data);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.name || !form.price || !coverFile) {
            alert('Заполните название, цену и загрузите обложку');
            return;
        }

        setIsSubmitting(true);
        try {
            const coverUrl = await api.uploadFile(coverFile);
            const galleryUrls = [];
            for (const file of galleryFiles) {
                const url = await api.uploadFile(file);
                galleryUrls.push(url);
            }

            await api.createProduct({
                ...form,
                price: Number(form.price),
                image: coverUrl,
                images: galleryUrls,
            });

            setForm({ name: '', price: '', description: '', tags: '', deliveryTime: '' });
            setCoverFile(null);
            setGalleryFiles([]);
            await loadProducts();
        } catch (err) {
            console.error(err);
            alert('Ошибка при сохранении товара');
        } finally {
            setIsSubmitting(false);
        }
    };

    const previewUrl = (file) => file ? URL.createObjectURL(file) : null;

    return (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <section style={{ background: 'white', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Plus size={18} /> Новый товар
                </h3>
                <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
                    <input name="name" placeholder="Название" value={form.name} onChange={handleChange} style={inputStyle} />
                    <input name="price" type="number" placeholder="Цена" value={form.price} onChange={handleChange} style={inputStyle} />
                    <input name="deliveryTime" placeholder="Время доставки (45 мин)" value={form.deliveryTime} onChange={handleChange} style={inputStyle} />
                    <input name="tags" placeholder="Теги (через запятую)" value={form.tags} onChange={handleChange} style={inputStyle} />
                    <textarea name="description" placeholder="Описание" value={form.description} onChange={handleChange} style={{ ...inputStyle, minHeight: 80 }} />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <label style={uploadBoxStyle}>
                            <UploadCloud size={20} />
                            <span>Обложка</span>
                            <input type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files[0] || null)} style={{ display: 'none' }} />
                            {coverFile && <img src={previewUrl(coverFile)} alt="cover preview" style={previewStyle} />}
                        </label>

                        <label style={uploadBoxStyle}>
                            <Images size={20} />
                            <span>Галерея (карусель)</span>
                            <input type="file" accept="image/*" multiple onChange={(e) => setGalleryFiles(Array.from(e.target.files || []))} style={{ display: 'none' }} />
                            {galleryFiles.length > 0 && (
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                    {galleryFiles.map((f, i) => (
                                        <img key={i} src={previewUrl(f)} alt="g" style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 6 }} />
                                    ))}
                                </div>
                            )}
                        </label>
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        style={{
                            background: '#EB712E',
                            color: 'white',
                            border: 'none',
                            borderRadius: 12,
                            padding: '12px 16px',
                            fontWeight: 700,
                            cursor: 'pointer'
                        }}
                    >
                        {isSubmitting ? 'Сохраняем…' : 'Создать'}
                    </button>
                </form>
            </section>

            <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>Все товары ({products.length})</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {products.map(product => (
                        <div key={product.id} style={{ background: 'white', borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', position: 'relative' }}>
                            <img src={product.image} style={{ width: '100%', height: 160, objectFit: 'cover' }} />
                            {product.images?.length > 0 && (
                                <div style={{ position: 'absolute', bottom: 12, right: 12, background: 'rgba(0,0,0,0.6)', color: 'white', padding: '4px 8px', borderRadius: 12, fontSize: 12 }}>
                                    {product.images.length} фото
                                </div>
                            )}
                            <div style={{ padding: 12 }}>
                                <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.name}</div>
                                <div style={{ color: '#EB712E', fontWeight: 700, marginTop: 4 }}>{product.price} ₽</div>
                            </div>
                            {product.images?.length > 0 && (
                                <div style={{ display: 'flex', gap: 6, padding: '0 12px 12px 12px' }}>
                                    {product.images.slice(0, 4).map((img) => (
                                        <img key={img.id} src={img.url} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }} />
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
};

const inputStyle = {
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid #E5E5EA',
    fontSize: 14
};

const uploadBoxStyle = {
    border: '1px dashed #E5E5EA',
    borderRadius: 12,
    padding: 12,
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    minHeight: 80
};

const previewStyle = {
    width: 60,
    height: 60,
    objectFit: 'cover',
    borderRadius: 8
};
