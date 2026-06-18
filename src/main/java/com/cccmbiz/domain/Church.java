package com.cccmbiz.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import java.util.Objects;

@Entity
public class Church {
    @Id
    @Column(name = "id")
    private Integer id;
    @Column(name = "acronym")   private String acronym;
    @Column(name = "name_cn")   private String nameCn;
    @Column(name = "name_en")   private String nameEn;
    @Column(name = "alias")     private String alias;
    @Column(name = "address")   private String address;
    @Column(name = "city")      private String city;
    @Column(name = "state")     private String state;
    @Column(name = "zipcode")   private String zipcode;
    @Column(name = "region")    private String region;
    @Column(name = "website")   private String website;
    @Column(name = "admin_id")  private Integer adminId;

    public Integer getId() { return id; }
    public void setId(Integer id) { this.id = id; }
    public String getAcronym() { return acronym; }
    public void setAcronym(String acronym) { this.acronym = acronym; }
    public String getNameCn() { return nameCn; }
    public void setNameCn(String nameCn) { this.nameCn = nameCn; }
    public String getNameEn() { return nameEn; }
    public void setNameEn(String nameEn) { this.nameEn = nameEn; }
    public String getAlias() { return alias; }
    public void setAlias(String alias) { this.alias = alias; }
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
    public String getZipcode() { return zipcode; }
    public void setZipcode(String zipcode) { this.zipcode = zipcode; }
    public String getRegion() { return region; }
    public void setRegion(String region) { this.region = region; }
    public String getWebsite() { return website; }
    public void setWebsite(String website) { this.website = website; }
    public Integer getAdminId() { return adminId; }
    public void setAdminId(Integer adminId) { this.adminId = adminId; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Church c = (Church) o;
        return Objects.equals(id, c.id);
    }

    @Override
    public int hashCode() { return Objects.hash(id); }
}
